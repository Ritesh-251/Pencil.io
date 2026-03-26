import { getChannel } from "../infra/rabbitmq"
import { roomManager } from "../manager/roomManager"
import { pubsub } from "../infra/redis"

export async function startBroadcastConsumer() {
  const channel = getChannel()

  await channel.consume("broadcast.queue", async (msg) => {
    if (!msg) return

    const event = JSON.parse(msg.content.toString())

    if (event.type !== "chat.message") return

    const outgoing = {
      type: "chat:new",
      payload: {
        messageId: event.payload.messageId,
        content: event.payload.content,
        userId: event.userId,
        timestamp: event.timestamp,
      },
    }

    try {
      // local
      roomManager.broadCast(event.roomId, outgoing)

      // cross-server
      await pubsub.publish({
        type: "chat:new",
        roomId: event.roomId,
        payload: outgoing,
      })

      channel.ack(msg)
    } catch (err) {
      console.error("Broadcast consumer error", err)
    }
  })
}