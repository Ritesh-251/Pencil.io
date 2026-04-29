import { Router, type RequestHandler } from "express";
import { prisma } from "@repo/db";
import crypto from "crypto";
import { logger } from "../infra/logger";

const router: Router = Router();

type InternalTranscriptPayload = {
  roomId?: unknown;
  participantIdentity?: unknown;
  text?: unknown;
  startMs?: unknown;
  endMs?: unknown;
};

function isAuthorized(authHeader: string | undefined) {
  const internalSecret = process.env.INTERNAL_SECRET;
  if (!internalSecret) return false;
  if (!authHeader?.startsWith("Bearer ")) return false;

  const provided = authHeader.slice("Bearer ".length);

  // Use hash comparison to avoid timing leaks of input length
  const expectedHash = crypto
    .createHash("sha256")
    .update(internalSecret)
    .digest();
  const actualHash = crypto.createHash("sha256").update(provided).digest();

  return crypto.timingSafeEqual(expectedHash, actualHash);
}

const createTranscriptHandler: RequestHandler = async (req, res) => {
  try {
    if (!isAuthorized(req.headers.authorization)) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const payload = req.body as InternalTranscriptPayload;
    const roomId =
      typeof payload.roomId === "string" ? payload.roomId.trim() : "";
    const participantIdentity =
      typeof payload.participantIdentity === "string"
        ? payload.participantIdentity.trim()
        : "";
    const text = typeof payload.text === "string" ? payload.text.trim() : "";
    const startMsRaw =
      typeof payload.startMs === "number"
        ? payload.startMs
        : Number(payload.startMs);
    const endMsRaw =
      typeof payload.endMs === "number" ? payload.endMs : Number(payload.endMs);

    if (!roomId || !participantIdentity || !text) {
      return res
        .status(400)
        .json({
          message: "roomId, participantIdentity, and text are required",
        });
    }
    if (!Number.isFinite(startMsRaw) || !Number.isFinite(endMsRaw)) {
      return res
        .status(400)
        .json({ message: "startMs and endMs must be numbers" });
    }

    const startMs = Math.max(0, Math.floor(startMsRaw));
    const endMs = Math.max(startMs, Math.floor(endMsRaw));

    await prisma.transcriptSegment.create({
      data: {
        roomId,
        participantIdentity,
        text,
        startMs,
        endMs,
      },
    });

    logger.info(
      {
        roomId,
        participantIdentity,
        startMs,
        endMs,
        textLength: text.length,
      },
      "Transcript segment stored",
    );

    return res.status(201).json({ ok: true });
  } catch (error) {
    logger.error({ err: error }, "Internal transcript ingestion failed");
    return res.status(500).json({ message: "Internal server error" });
  }
};

const transcriptHealthHandler: RequestHandler = async (req, res) => {
  try {
    if (!isAuthorized(req.headers.authorization)) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const roomId =
      typeof req.query.roomId === "string" ? req.query.roomId.trim() : "";
    const where = roomId ? { roomId } : {};

    const [count, latest] = await Promise.all([
      prisma.transcriptSegment.count({ where }),
      prisma.transcriptSegment.findFirst({
        where,
        orderBy: { createdAt: "desc" },
        select: {
          roomId: true,
          participantIdentity: true,
          text: true,
          startMs: true,
          endMs: true,
          createdAt: true,
        },
      }),
    ]);

    return res.status(200).json({
      ok: true,
      roomId: roomId || null,
      totalSegments: count,
      latest,
    });
  } catch (error) {
    logger.error({ err: error }, "Transcript health check failed");
    return res.status(500).json({ message: "Internal server error" });
  }
};

router.post("/transcript", createTranscriptHandler);
router.get("/transcript/health", transcriptHealthHandler);

export default router;
