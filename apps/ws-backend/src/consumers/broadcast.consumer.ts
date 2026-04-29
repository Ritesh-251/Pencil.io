import { ConsumeMessage } from "amqplib";
import { getChannel } from "../infra/rabbitmq";
import { roomManager } from "../manager/roomManager";
import { safePublish } from "../infra/redis";
import { logEvent, logger } from "../infra/logger";
import { recordError, recordErrorDetail } from "../monitor/metrics";

export async function startBroadcastConsumer() {
  const channel = getChannel();

  await channel.consume(
    "broadcast.queue",
    async (msg: ConsumeMessage | null) => {
      if (!msg) return;

      const startedAt = Date.now();
      const event = JSON.parse(msg.content.toString());

      if (event.type !== "chat.message") {
        logger.warn(
          { eventType: event.type, eventId: event.id },
          "broadcast.consumer: unknown event type, skipping",
        );
        channel.ack(msg);
        return;
      }

      const outgoing = {
        type: "chat:new",
        payload: {
          messageId: event.payload.messageId,
          content: event.payload.content,
          userId: event.userId,
          timestamp: event.timestamp,
        },
      };

      try {
        // local
        roomManager.broadCast(event.roomId, outgoing);

        // cross-server
        await safePublish({
          type: "chat:new",
          roomId: event.roomId,
          payload: outgoing.payload,
        });

        channel.ack(msg);
        logEvent("broadcast", event, { durationMs: Date.now() - startedAt });
      } catch (err) {
        recordError();
        recordErrorDetail({
          stage: "broadcast",
          type: event.type,
          message:
            err instanceof Error ? err.message : "Broadcast consumer error",
        });
        logger.error(
          {
            stage: "broadcast",
            eventId: event.id,
            roomId: event.roomId,
            userId: event.userId,
            type: event.type,
            durationMs: Date.now() - startedAt,
            err,
          },
          "Broadcast consumer error",
        );
      }
    },
  );
}
