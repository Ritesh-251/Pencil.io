import { ConsumeMessage } from "amqplib";
import { getChannel } from "../infra/rabbitmq"
import { prisma } from "@repo/db"
import { Prisma } from "@repo/db"
import { logEvent, logger } from "../infra/logger"
import { recordError, recordErrorDetail } from "../monitor/metrics"

export async function startChatConsumer() {
  const channel = getChannel()

  await channel.consume("chat.queue", async (msg: ConsumeMessage | null) => {
    if (!msg) return

    const startedAt = Date.now()
    const event = JSON.parse(msg.content.toString())

    if (event.type !== "chat.message") {
      channel.ack(msg)
      return
    }

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
      logEvent("consume", event, { durationMs: Date.now() - startedAt })
    } catch (err) {
      
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        logger.info({ eventId: event.id, roomId: event.roomId }, "Chat dedup: message already persisted")
        channel.ack(msg)
        return
      }
      recordError()
      recordErrorDetail({
        stage: "consume",
        type: event.type,
        message: err instanceof Error ? err.message : "Chat consumer error",
      })
      logger.error({
        stage: "consume",
        eventId: event.id,
        roomId: event.roomId,
        userId: event.userId,
        type: event.type,
        durationMs: Date.now() - startedAt,
        err,
      }, "Chat consumer error")
      
    }
  })
}