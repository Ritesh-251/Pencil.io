import { getChannel } from "../infra/rabbitmq"
import { roomManager } from "../manager/roomManager"
import { pubsub } from "../infra/redis"

export async function startCanvasConsumer() {
  const channel = getChannel()

  await channel.consume("canvas.queue", async (msg) => {
    if (!msg) return

    const event = JSON.parse(msg.content.toString())

    if (event.type !== "canvas.draw") return

    const outgoing = {
      type: "canvas:draw",
      payload: {
        strokeId: event.payload.strokeId,
        points: event.payload.points,
        color: event.payload.color,
        width: event.payload.width,
        userId: event.userId,
      },
    }

    try {
      // local sockets in this room
      roomManager.broadCast(event.roomId, outgoing)

      // other WS server instances via Redis
      await pubsub.publish({
        type: "canvas:draw",
        roomId: event.roomId,
        payload: outgoing,
      })

      channel.ack(msg)
    } catch (err) {
      console.error("Canvas consumer error:", err)
      // no ack → requeue
    }
  })
}
