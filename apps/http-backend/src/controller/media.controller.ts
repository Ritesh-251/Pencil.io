import { joinRoomSchema } from "@repo/validation";
import { Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware";
import { ApiError } from "../utils/ApiError";
import {
  createMediaToken,
  ensureTranscriptionAgentDispatch,
  stopTranscriptionAgentDispatch,
} from "../services/mediaToken.service";
import { logger } from "../infra/logger";
import { prisma } from "@repo/db";

export async function issueRoomMediaToken(req: AuthRequest, res: Response) {
  try {
    const parsed = joinRoomSchema.safeParse(req.params);
    if (!parsed.success) {
      return res.status(400).json({
        message: parsed.error.issues[0]?.message ?? "Validation error",
      });
    }

    const userId = req.userId;
    if (!userId) {
      throw new ApiError(401, "Unauthorized");
    }

    const session = await createMediaToken({
      roomId: parsed.data.roomId,
      userId,
    });

    return res.status(200).json(session);
  } catch (error) {
    if (error instanceof ApiError) {
      return res.status(error.statusCode).json({
        message: error.message,
      });
    }

    logger.error(
      {
        err: error,
        userId: req.userId,
        roomId: req.params.roomId,
      },
      "issueRoomMediaToken failed",
    );
    return res.status(500).json({
      message: "Internal server error",
    });
  }
}

export async function startTranscription(req: AuthRequest, res: Response) {
  try {
    const roomId = String(req.params.roomId || "");
    const userId = req.userId;
    if (!userId || !roomId) {
      throw new ApiError(401, "Unauthorized or missing roomId");
    }

    const livekitUrl = process.env.LIVEKIT_URL || "";
    const apiKey = process.env.LIVEKIT_API_KEY || "";
    const apiSecret = process.env.LIVEKIT_API_SECRET || "";

    if (!livekitUrl || !apiKey || !apiSecret) {
      throw new ApiError(500, "LiveKit is not configured");
    }

    const member = await prisma.roomMember.findUnique({
      where: { userId_roomId: { userId, roomId } },
    });
    if (!member) {
      throw new ApiError(403, "Not a member of this room");
    }

    await ensureTranscriptionAgentDispatch({
      roomId,
      livekitUrl,
      apiKey,
      apiSecret,
    });

    return res.status(200).json({ message: "Transcription agent dispatched" });
  } catch (error) {
    if (error instanceof ApiError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    logger.error(
      { err: error, roomId: req.params.roomId },
      "startTranscription failed",
    );
    return res.status(500).json({ message: "Internal server error" });
  }
}

export async function stopTranscription(req: AuthRequest, res: Response) {
  try {
    const roomId = String(req.params.roomId || "");
    const userId = req.userId;
    if (!userId || !roomId) {
      throw new ApiError(401, "Unauthorized or missing roomId");
    }

    const livekitUrl = process.env.LIVEKIT_URL || "";
    const apiKey = process.env.LIVEKIT_API_KEY || "";
    const apiSecret = process.env.LIVEKIT_API_SECRET || "";

    if (!livekitUrl || !apiKey || !apiSecret) {
      throw new ApiError(500, "LiveKit is not configured");
    }

    const member = await prisma.roomMember.findUnique({
      where: { userId_roomId: { userId, roomId } },
    });
    if (!member) {
      throw new ApiError(403, "Not a member of this room");
    }

    const result = await stopTranscriptionAgentDispatch({
      roomId,
      livekitUrl,
      apiKey,
      apiSecret,
    });

    return res.status(200).json({
      message: "Transcription agent stopped",
      stoppedDispatches: result.stopped,
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    logger.error(
      { err: error, roomId: req.params.roomId },
      "stopTranscription failed",
    );
    return res.status(500).json({ message: "Internal server error" });
  }
}
