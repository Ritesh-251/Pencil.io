import { Prisma, prisma } from "@repo/db";
import crypto from "crypto";
import { aiService } from "./ai.service";
import {
  buildUnifiedTimeline,
  chunkTimeline,
  fetchTimelineData,
} from "../timeline";

export class TimelineService {
  private toVectorLiteral(values: number[]) {
    if (!Array.isArray(values) || values.length === 0) {
      throw new Error("embedding must be a non-empty number array");
    }
    for (const value of values) {
      if (!Number.isFinite(value)) {
        throw new Error("embedding contains a non-finite value");
      }
    }
    return `[${values.join(",")}]`;
  }

  async getRoomActivityCounts(roomId: string) {
    const [canvasEvents, chatMessages, transcriptSegments, chunks] =
      await Promise.all([
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

    const embeddings: number[][] = [];
    for (const chunk of chunks) {
      const vector = await aiService.embedText(chunk.content);
      embeddings.push(vector);
    }

    await prisma.$transaction(async (tx) => {
      await tx.sessionChunk.deleteMany({ where: { roomId } });

      for (const [index, chunk] of chunks.entries()) {
        const vectorLiteral = this.toVectorLiteral(embeddings[index]!);
        await tx.$executeRaw(
          Prisma.sql`INSERT INTO "SessionChunk" ("id", "roomId", "content", "embedding", "startMs", "endMs", "createdAt")
           VALUES (${crypto.randomUUID()}, ${roomId}, ${chunk.content}, ${vectorLiteral}::vector, ${chunk.startMs}, ${chunk.endMs}, NOW())`,
        );
      }
    });

    return { counts: { ...counts, chunks: chunks.length } };
  }

  async retrieveChunks(roomId: string, questionEmbedding: number[], limit = 8) {
    const vectorLiteral = this.toVectorLiteral(questionEmbedding);
    return prisma.$queryRaw<any[]>`
      SELECT "id", "content", "startMs", "endMs",
             (1 - ("embedding" <=> ${vectorLiteral}::vector)) AS "score"
      FROM "SessionChunk"
      WHERE "roomId" = ${roomId}
        AND "embedding" IS NOT NULL
      ORDER BY "embedding" <=> ${vectorLiteral}::vector
      LIMIT ${limit}
    `;
  }

  sourceTypeFromContent(
    content: string,
  ): "canvas" | "chat" | "speech" | "timeline" {
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
      .map(
        (content, index) =>
          `${index + 1}. ${content.slice(0, 220)}${content.length > 220 ? "..." : ""}`,
      );

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
