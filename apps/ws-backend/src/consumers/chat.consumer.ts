import { ConsumeMessage } from "amqplib";
import { getChannel } from "../infra/rabbitmq";
import { prisma } from "@repo/db";
import { Prisma } from "@repo/db";
import { logEvent, logger } from "../infra/logger";
import { recordError, recordErrorDetail } from "../monitor/metrics";

export async function startChatConsumer() {
  const channel = getChannel();

  await channel.consume("chat.queue", async (msg: ConsumeMessage | null) => {
    if (!msg) return;
    const startedAt = Date.now();

    try {
      const event = JSON.parse(msg.content.toString());

      if (event.type !== "chat.message") {
        channel.ack(msg);
        return;
      }

      await prisma.message.create({
        data: {
          id: event.payload.messageId,
          content: event.payload.content,
          roomId: event.roomId,
          userId: event.userId,
          createdAt: new Date(event.timestamp),
        },
      });

      channel.ack(msg);
      logEvent("consume", event, { durationMs: Date.now() - startedAt });
    } catch (err: any) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        logger.info("Chat dedup: message already persisted");
        channel.ack(msg);
        return;
      }

      recordError();
      logger.error({ err, stage: "consume" }, "Chat consumer error");

      // Poison message handling: nack and don't requeue if it's a parsing/validation error
      // or after some internal logic. For now, we nack without requeue to prevent loops.
      channel.nack(msg, false, false);
    }
  });
}
