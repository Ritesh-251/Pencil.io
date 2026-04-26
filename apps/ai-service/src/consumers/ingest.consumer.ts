import { ConsumeMessage } from "amqplib";
import { getChannel } from "../infra/rabbitmq";
import { timelineService } from "../services/timeline.service";

export async function startIngestConsumer() {
  const channel = getChannel();
  const QUEUE = "ai:ingest";

  await channel.assertQueue(QUEUE, { durable: true });
  channel.prefetch(1);

  console.log(`AI Service: Ingest Consumer started on queue [${QUEUE}]`);

  channel.consume(QUEUE, async (msg: ConsumeMessage | null) => {
    if (!msg) return;

    try {
      const data = JSON.parse(msg.content.toString());
      const { roomId, includeTranscript } = data;

      console.log(`AI Service: Background Ingestion started for room [${roomId}]`);
      
      await timelineService.ingestRoom(roomId, { includeTranscript });
      
      console.log(`AI Service: Background Ingestion completed for room [${roomId}]`);
      channel.ack(msg);
    } catch (error) {
      console.error("AI Service: Background Ingestion failed", error);
      channel.ack(msg);
    }
  });
}
