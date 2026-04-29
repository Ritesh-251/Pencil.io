import { ConsumeMessage } from "amqplib";
import { getChannel } from "../infra/rabbitmq";
import { timelineService } from "../services/timeline.service";
import { logger } from "../infra/logger";

// BUG-6 FIX: Distinguish transient errors (network, DB, rate-limit) that
// should be retried from permanent errors (bad payload, business logic) that
// should be acked and discarded.  Previously every error was acked, meaning
// transient failures caused permanent message loss.

function isTransientError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  // Network / connection errors
  if (
    msg.includes("econnrefused") ||
    msg.includes("enotfound") ||
    msg.includes("etimedout")
  )
    return true;
  // Prisma connection / timeout errors
  if (
    msg.includes("unable to start a transaction") ||
    msg.includes("connection pool")
  )
    return true;
  // HTTP 429 / 503 from Gemini or Ollama
  if (msg.includes("429") || msg.includes("503") || msg.includes("rate limit"))
    return true;
  return false;
}

export async function startIngestConsumer() {
  const channel = getChannel();
  const QUEUE = "ai:ingest";

  await channel.assertQueue(QUEUE, { durable: true });
  channel.prefetch(1);

  logger.info({ queue: QUEUE }, "AI Service: Ingest Consumer started");

  channel.consume(QUEUE, async (msg: ConsumeMessage | null) => {
    if (!msg) return;

    try {
      const data = JSON.parse(msg.content.toString());
      const { roomId, includeTranscript } = data;

      logger.info({ roomId }, "AI Service: Background Ingestion started");
      await timelineService.ingestRoom(roomId, { includeTranscript });
      logger.info({ roomId }, "AI Service: Background Ingestion completed");

      channel.ack(msg);
    } catch (error) {
      logger.error({ error }, "AI Service: Background Ingestion failed");

      if (isTransientError(error)) {
        // Requeue so the message is retried after the RabbitMQ consumer delay
        channel.nack(msg, false, true);
      } else {
        // Permanent failure — ack to discard (the error is already logged)
        channel.ack(msg);
      }
    }
  });
}
