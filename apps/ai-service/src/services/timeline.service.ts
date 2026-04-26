import { prisma } from "@repo/db";
import crypto from "crypto";
import { aiService } from "./ai.service";
import { buildUnifiedTimeline, chunkTimeline, fetchTimelineData } from "../timeline";

export class TimelineService {
  async getRoomActivityCounts(roomId: string) {
    const [canvasEvents, chatMessages, transcriptSegments, chunks] = await Promise.all([
      prisma.canvasActionHistory.count({ where: { roomId } }),
      prisma.message.count({ where: { roomId } }),
      prisma.transcriptSegment.count({ where: { roomId } }),
      prisma.sessionChunk.count({ where: { roomId } }),
    ]);

    return { canvasEvents, chatMessages, transcriptSegments, chunks };
  }

  async ingestRoom(roomId: string, options?: { includeTranscript?: boolean }) {
    const timelineData = await fetchTimelineData(roomId, {
      includeTranscript: options?.includeTranscript,
    });
    const { timeline, counts } = buildUnifiedTimeline(roomId, timelineData);
    const chunks = chunkTimeline(timeline);

    if (chunks.length === 0) {
      await prisma.sessionChunk.deleteMany({ where: { roomId } });
      return { counts: { ...counts, chunks: 0 } };
    }

    const embeddings = await Promise.all(
      chunks.map((chunk) => aiService.embedText(chunk.content))
    );

    await prisma.$transaction(async (tx) => {
      await tx.sessionChunk.deleteMany({ where: { roomId } });

      const inserts = chunks.map((chunk, index) => {
        const vectorLiteral = `[${embeddings[index]!.join(",")}]`;
        return tx.$executeRawUnsafe(
          `INSERT INTO "SessionChunk" ("id", "roomId", "content", "embedding", "startMs", "endMs", "createdAt")
           VALUES ($1, $2, $3, $4::vector, $5, $6, NOW())`,
          crypto.randomUUID(),
          roomId,
          chunk.content,
          vectorLiteral,
          chunk.startMs,
          chunk.endMs,
        );
      });

      await Promise.all(inserts);
    });

    return { counts: { ...counts, chunks: chunks.length } };
  }

  async retrieveChunks(roomId: string, questionEmbedding: number[], limit = 8) {
    const vectorLiteral = `[${questionEmbedding.join(",")}]`;
    return prisma.$queryRawUnsafe<any[]>(
      `SELECT "id", "content", "startMs", "endMs",
              (1 - ("embedding" <=> $1::vector)) AS "score"
       FROM "SessionChunk"
       WHERE "roomId" = $2
         AND "embedding" IS NOT NULL
       ORDER BY "embedding" <=> $1::vector
       LIMIT $3`,
      vectorLiteral,
      roomId,
      limit,
    );
  }

  sourceTypeFromContent(content: string): "canvas" | "chat" | "speech" | "timeline" {
    if (content.includes("[canvas]")) return "canvas";
    if (content.includes("[chat]")) return "chat";
    if (content.includes("[speech]")) return "speech";
    return "timeline";
  }

  buildHeuristicSummary(input: {
    roomId: string;
    counts: any;
    contextChunks: Array<{ content: string }>;
  }) {
    const previewLines = input.contextChunks
      .slice(0, 4)
      .map((item) => item.content.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .map((content, index) => `${index + 1}. ${content.slice(0, 220)}${content.length > 220 ? "..." : ""}`);

    return [
      `Executive Summary (Room ${input.roomId})`,
      "",
      "A structured summary was generated from timeline evidence.",
      "",
      "Timeline Highlights",
      `- Canvas events: ${input.counts.canvasEvents}`,
      `- Chat messages: ${input.counts.chatMessages}`,
      `- Transcript segments: ${input.counts.transcriptSegments}`,
      `- Context chunks: ${input.counts.chunks}`,
      "",
      "Evidence Excerpts",
      previewLines.join("\n"),
      "",
      "Note: AI model generation was unavailable at runtime.",
    ].join("\n");
  }
}

export const timelineService = new TimelineService();
