import { getChannel } from "../infra/rabbitmq"
import { prisma } from "@repo/db"
import { Prisma } from "@repo/db"

export async function startChatConsumer() {
  const channel = getChannel()

  await channel.consume("chat.queue", async (msg) => {
    if (!msg) return

    const event = JSON.parse(msg.content.toString())

    if (event.type !== "chat.message") return

    try {
      await prisma.message.create({
        data: {
          id: event.payload.messageId,
          content: event.payload.content,
          roomId: event.roomId,
          userId: event.userId,
          createdAt: new Date(event.timestamp),
        },
      })

      channel.ack(msg)
    } catch (err) {
      
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        console.log("[ChatConsumer] Duplicate message, already persisted — acking")
        channel.ack(msg)
        return
      }
      console.error("Chat consumer error", err)
      
    }
  })
}