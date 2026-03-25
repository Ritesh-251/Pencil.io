import { getChannel } from "../rabbitmq"
import { Event } from "../../types/event"

class EventPublisher {
  async publish(event: Event) {
    const channel = getChannel()

    channel.publish(
      "events.exchange",
      event.type,
      Buffer.from(JSON.stringify(event)),
      { persistent: true }
    )
  }
}

export const eventPublisher = new EventPublisher()