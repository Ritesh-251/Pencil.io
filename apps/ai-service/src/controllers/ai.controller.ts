import { Request, Response } from "express";
import { prisma } from "@repo/db";
import { aiService } from "../services/ai.service";
import { timelineService } from "../services/timeline.service";
import { getChannel } from "../infra/rabbitmq";
import { SYSTEM_PROMPTS } from "../prompts";
import { logger } from "../infra/logger";

export class AiController {
  async ingest(req: Request, res: Response) {
    try {
      const roomId = String(req.params.roomId || "").trim();
      const includeTranscript = req.body?.includeTranscript !== false;
      if (!roomId) return res.status(400).json({ message: "Room ID required" });

      const channel = getChannel();
      if (!channel) throw new Error("RabbitMQ channel not available");

      channel.sendToQueue("ai:ingest", Buffer.from(JSON.stringify({ roomId, includeTranscript })), { persistent: true });

      return res.status(202).json({ message: "Ingestion started in background", status: "PENDING" });
    } catch (error: any) {
      logger.error({ error, roomId: req.params.roomId }, "Failed to initiate ingestion");
      return res.status(500).json({ message: error.message });
    }
  }

  async query(req: Request, res: Response) {
    try {
      const roomId = String(req.params.roomId || "");
      const question = String(req.body?.question || "");
      const canvasImage = req.body?.canvasImage;
      const includeTranscript = req.body?.includeTranscript !== false;
      
      if (!roomId || !question) return res.status(400).json({ message: "Room ID and Question required" });

      const questionEmbedding = await aiService.embedText(question);
      let chunks = await timelineService.retrieveChunks(roomId, questionEmbedding);

      if (chunks.length === 0) {
        await timelineService.ingestRoom(roomId, { includeTranscript });
        chunks = await timelineService.retrieveChunks(roomId, questionEmbedding);
      }

      const context = chunks.map((c, i) => `Chunk ${i + 1}:\n${c.content}`).join("\n\n");
      const result = await aiService.generateWithFallback({
        model: process.env.GEMINI_CHAT_MODEL!,
        system: SYSTEM_PROMPTS.QUERY_ASSISTANT,
        prompt: `Context:\n${context}\n\nQuestion:\n${question}`,
        image: canvasImage,
      });

      return res.status(200).json({
        answer: result.text,
        provider: result.provider,
        sources: chunks.map(c => ({
          type: timelineService.sourceTypeFromContent(c.content),
          content: c.content,
          score: c.score,
        }))
      });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  }

  async summary(req: Request, res: Response) {
    try {
      const roomId = String(req.params.roomId || "");
      const refresh = req.query.refresh === "true";
      const includeTranscript = req.query.includeTranscript !== "false";

      if (!refresh) {
        const cached = await prisma.sessionSummary.findUnique({ where: { roomId } });
        if (cached) {
          const counts = await timelineService.getRoomActivityCounts(roomId);
          return res.status(200).json({ summary: cached.summary, counts, cached: true });
        }
      }

      const ingestResult = await timelineService.ingestRoom(roomId, { includeTranscript });
      const contextChunks = await prisma.sessionChunk.findMany({
        where: { roomId }, orderBy: { startMs: "asc" }, take: 32, select: { content: true }
      });

      const context = contextChunks.map(c => c.content).join("\n\n");
      let summary: string;
      let provider: string;

      try {
        const result = await aiService.generateWithFallback({
          model: process.env.GEMINI_SUMMARY_MODEL!,
          system: SYSTEM_PROMPTS.SUMMARY_STRATEGIST.replace("[Current Date]", new Date().toLocaleDateString()),
          prompt: context || "No activity found.",
        });
        summary = result.text;
        provider = result.provider;
      } catch (err) {
        summary = timelineService.buildHeuristicSummary({ roomId, counts: ingestResult.counts, contextChunks });
        provider = "timeline-fallback";
      }

      await prisma.sessionSummary.upsert({
        where: { roomId }, create: { roomId, summary }, update: { summary }
      });

      // 🔥 Trigger Email Summary to participants
      void this.notifyParticipants(roomId, summary);

      return res.status(200).json({ summary, provider, counts: ingestResult.counts, cached: false });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  }

  private async notifyParticipants(roomId: string, summary: string) {
    try {
      const room = await prisma.room.findUnique({
        where: { id: roomId },
        include: { members: { include: { user: { select: { email: true } } } } }
      });

      if (!room) return;

      const emails = room.members.map(m => m.user.email).filter(Boolean);
      if (emails.length === 0) return;

      const channel = getChannel();
      const content = Buffer.from(JSON.stringify({
        type: "SESSION_SUMMARY",
        payload: {
          emails,
          summary,
          roomName: room.name || "Collaborative Session"
        }
      }));

      channel.publish("events.exchange", "email.summary", content, { persistent: true });
    } catch (error) {
      logger.error({ error, roomId }, "Failed to notify participants via email");
    }
  }
}

export const aiController = new AiController();
