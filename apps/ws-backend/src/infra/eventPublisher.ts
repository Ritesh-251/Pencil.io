import { getChannel } from "./rabbitmq";
import { Event } from "../types/event";
import { isOverloaded } from "../monitor/systemLoad";
import {
  assertQueueWritable,
  BackpressureError,
} from "../monitor/queueMonitor";
import { logEvent, logger } from "./logger";
import { recordBackpressureTrigger, recordError } from "../monitor/metrics";

const WRITE_EVENT_TYPES = new Set([
  "chat.message",
  "canvas.draw",
  "canvas.undo",
  "canvas.redo",
]);

const PUBLISH_CONFIRM_TIMEOUT_MS = Number(
  process.env.RABBITMQ_PUBLISH_CONFIRM_TIMEOUT_MS || 5000,
);

function queueForEvent(eventType: string) {
  if (eventType.startsWith("canvas.")) return "canvas.queue";
  if (eventType === "chat.message") return "chat.queue";
  throw new Error(`Unknown event type: ${eventType}`);
}

class EventPublisher {
  async publish(event: Event) {
    if (WRITE_EVENT_TYPES.has(event.type) && isOverloaded()) {
      recordBackpressureTrigger();
      throw new BackpressureError("System overloaded");
    }

    try {
      await assertQueueWritable(queueForEvent(event.type));
    } catch (error) {
      if (error instanceof BackpressureError) {
        recordBackpressureTrigger();
      }
      throw error;
    }

    const channel = getChannel();

    return new Promise<boolean>((resolve, reject) => {
      const timeout = setTimeout(() => {
        recordError();
        const error = new Error(
          `Publish confirm timed out after ${PUBLISH_CONFIRM_TIMEOUT_MS}ms`,
        );
        logger.error(
          {
            stage: "publish",
            eventId: event.id,
            roomId: event.roomId,
            userId: event.userId,
            type: event.type,
            timeoutMs: PUBLISH_CONFIRM_TIMEOUT_MS,
          },
          "Publish confirm timed out",
        );
        reject(error);
      }, PUBLISH_CONFIRM_TIMEOUT_MS);

      channel.publish(
        "events.exchange",
        event.type,
        Buffer.from(JSON.stringify(event)),
        { persistent: true },
        (err: any) => {
          clearTimeout(timeout);
          if (err) {
            recordError();
            logger.error(
              {
                stage: "publish",
                eventId: event.id,
                roomId: event.roomId,
                userId: event.userId,
                type: event.type,
                err,
              },
              "Publish confirm failed",
            );
            reject(err);
            return;
          }

          logEvent("publish", event);
          resolve(true);
        },
      );
    });
  }
}

export const eventPublisher = new EventPublisher();
export { BackpressureError };
