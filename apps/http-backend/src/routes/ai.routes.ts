import { Router } from "express";
import { prisma } from "@repo/db";
import {
  authMiddleware,
  type AuthRequest,
} from "../middleware/auth.middleware";
import { ApiError } from "../utils/ApiError";
import { logger } from "../infra/logger";

const router: Router = Router({ mergeParams: true });

function getAiServiceUrl() {
  const baseUrl = process.env.AI_SERVICE_URL;
  if (!baseUrl) {
    throw new ApiError(500, "AI_SERVICE_URL is not configured");
  }
  return baseUrl.replace(/\/$/, "");
}

async function ensureRoomMembership(userId: string, roomId: string) {
  const member = await prisma.roomMember.findUnique({
    where: {
      userId_roomId: {
        userId,
        roomId,
      },
    },
    select: { id: true },
  });
  if (!member) {
    throw new ApiError(403, "You are not a member of this room");
  }
}

async function proxyToAiService(path: string, init?: RequestInit) {
  const aiUrl = `${getAiServiceUrl()}${path}`;
  const response = await fetch(aiUrl, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.INTERNAL_SECRET}`,
      ...(init?.headers ?? {}),
    },
  });

  let payload;
  try {
    payload = await response.json();
  } catch (err) {
    logger.error({ err, path, status: response.status }, "AI service returned invalid JSON");
    payload = { error: "Invalid response from AI service" };
  }
  return { status: response.status, payload };
}

router.post("/ingest", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const roomId = String(req.params.roomId || "").trim();
    const userId = req.userId;
    if (!userId) throw new ApiError(401, "Unauthorized");
    if (!roomId) throw new ApiError(400, "Room ID required");

    await ensureRoomMembership(userId, roomId);
    const includeTranscript = req.body?.includeTranscript !== false;
    const result = await proxyToAiService(`/ai/${roomId}/ingest`, {
      method: "POST",
      body: JSON.stringify({ includeTranscript }),
    });
    return res.status(result.status).json(result.payload);
  } catch (error) {
    if (error instanceof ApiError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    logger.error(
      { err: error, roomId: req.params.roomId },
      "AI ingest route failed",
    );
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/summary", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const roomId = String(req.params.roomId || "").trim();
    const userId = req.userId;
    if (!userId) throw new ApiError(401, "Unauthorized");
    if (!roomId) throw new ApiError(400, "Room ID required");

    await ensureRoomMembership(userId, roomId);
    const refresh = String(req.query.refresh || "").toLowerCase() === "true";
    const includeTranscript =
      String(req.query.includeTranscript || "true").toLowerCase() !== "false";
    const queryParams = new URLSearchParams();
    if (refresh) queryParams.set("refresh", "true");
    if (!includeTranscript) queryParams.set("includeTranscript", "false");
    const queryString = queryParams.toString()
      ? `?${queryParams.toString()}`
      : "";
    const canvasImage =
      typeof req.body?.canvasImage === "string"
        ? req.body.canvasImage
        : undefined;
    const result = await proxyToAiService(
      `/ai/${roomId}/summary${queryString}`,
      {
        method: "POST",
        body: JSON.stringify({ canvasImage }),
      },
    );
    return res.status(result.status).json(result.payload);
  } catch (error) {
    if (error instanceof ApiError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    logger.error(
      { err: error, roomId: req.params.roomId },
      "AI summary route failed",
    );
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/query", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const roomId = String(req.params.roomId || "").trim();
    const userId = req.userId;
    const question =
      typeof req.body?.question === "string" ? req.body.question.trim() : "";
    const includeTranscript = req.body?.includeTranscript !== false;
    if (!userId) throw new ApiError(401, "Unauthorized");
    if (!roomId) throw new ApiError(400, "Room ID required");
    if (!question) throw new ApiError(400, "Question is required");

    await ensureRoomMembership(userId, roomId);
    const canvasImage =
      typeof req.body?.canvasImage === "string"
        ? req.body.canvasImage
        : undefined;
    const result = await proxyToAiService(`/ai/${roomId}/query`, {
      method: "POST",
      body: JSON.stringify({ question, includeTranscript, canvasImage }),
    });
    return res.status(result.status).json(result.payload);
  } catch (error) {
    if (error instanceof ApiError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    logger.error(
      { err: error, roomId: req.params.roomId },
      "AI query route failed",
    );
    return res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
