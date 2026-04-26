import { getChannel } from "./rabbitmq"
import { Event } from "../types/event"
import { isOverloaded } from "../monitor/systemLoad"
import { assertQueueWritable, BackpressureError } from "../monitor/queueMonitor"
import { logEvent, logger } from "./logger"
import { recordBackpressureTrigger, recordError } from "../monitor/metrics"

const WRITE_EVENT_TYPES = new Set([
  "chat.message",
  "canvas.draw",
  "canvas.undo",
  "canvas.redo",
])

function queueForEvent(eventType: string) {
  if (eventType.startsWith("canvas.")) return "canvas.queue"
  if (eventType === "chat.message") return "chat.queue"
  throw new Error(`Unknown event type: ${eventType}`)
}

class EventPublisher {
  async publish(event: Event) {
    if (WRITE_EVENT_TYPES.has(event.type) && isOverloaded()) {
      recordBackpressureTrigger()
      throw new BackpressureError("System overloaded")
    }

    try {
      await assertQueueWritable(queueForEvent(event.type))
    } catch (error) {
      if (error instanceof BackpressureError) {
        recordBackpressureTrigger()
      }
      throw error
    }

    const channel = getChannel()

    return new Promise<boolean>((resolve, reject) => {
      channel.publish(
        "events.exchange",
        event.type,
        Buffer.from(JSON.stringify(event)),
        { persistent: true },
        (err: any) => {
          if (err) {
            recordError()
            logger.error({
              stage: "publish",
              eventId: event.id,
              roomId: event.roomId,
              userId: event.userId,
              type: event.type,
              err,
            }, "Publish confirm failed")
            reject(err)
            return
          }

          logEvent("publish", event)
          resolve(true)
        },
      )
    })
  }
}

export const eventPublisher = new EventPublisher()
export { BackpressureError }
