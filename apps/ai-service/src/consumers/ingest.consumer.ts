import { ConsumeMessage } from "amqplib";
import { getChannel } from "../infra/rabbitmq";
import { timelineService } from "../services/timeline.service";
import { logger } from "../infra/logger";

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
      channel.ack(msg);
    }
  });
}
