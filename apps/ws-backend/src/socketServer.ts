import { createServer } from "http";
import { WebSocketServer } from "ws";
import express from "express";
import cors from "cors";
import crypto from "crypto";
import { SocketManager } from "./socketManager";
import { storageService } from "@repo/storage";

export const socketManager = new SocketManager();
import {
  getHealthStatus,
  getInternalStatus,
  runReplayCheck,
} from "./internal/status";
import { URL } from "url";
import fs from "fs";
import path from "path";
import { handleUploadUrlRequest } from "./controller/upload.controller";
import { logger } from "./infra/logger";
import { assertRoomMember } from "./services/roomAccess.service";
import { verifyImageUploadTicketForPut } from "./services/imageUpload.service";
import { getUserIdFromAuthHeader } from "./utils/auth.util";
import {
  normalizeHeaderValue,
  resolveCorsOrigin,
  withCorsHeaders,
} from "./utils/http.util";
import { createRedisRateLimiter } from "./middleware/rateLimit.middleware";

function getClientIp(req: express.Request) {
  const forwarded = req.headers?.["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }

  return req.socket?.remoteAddress || "unknown";
}

const LOCAL_UPLOAD_ROOT = path.resolve(process.cwd(), ".uploads");
const UPLOAD_PEER_BASE_URLS = (process.env.IMAGE_UPLOAD_PEER_BASE_URLS || "")
  .split(",")
  .map((value) => value.trim().replace(/\/$/, ""))
  .filter(Boolean);

function sanitizeUploadPath(
  urlPathname: string,
): { absolutePath: string; relativePath: string; mimeType: string } | null {
  if (!urlPathname.startsWith("/upload/")) {
    return null;
  }

  const relative = decodeURIComponent(urlPathname.slice("/upload/".length))
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");

  if (!relative || relative.includes("..")) {
    return null;
  }

  const absolutePath = path.resolve(LOCAL_UPLOAD_ROOT, relative);
  if (!absolutePath.startsWith(LOCAL_UPLOAD_ROOT)) {
    return null;
  }

  const ext = path.extname(absolutePath).toLowerCase();
  const mimeType =
    ext === ".png"
      ? "image/png"
      : ext === ".jpg" || ext === ".jpeg"
        ? "image/jpeg"
        : ext === ".webp"
          ? "image/webp"
          : ext === ".gif"
            ? "image/gif"
            : ext === ".avif"
              ? "image/avif"
              : ext === ".svg"
                ? "image/svg+xml"
                : "application/octet-stream";

  return { absolutePath, relativePath: relative, mimeType };
}

async function readRawBody(
  req: express.Request,
  limitBytes = 16 * 1024 * 1024,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of req) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += part.length;
    if (total > limitBytes) {
      throw new Error("request body too large");
    }
    chunks.push(part);
  }

  return Buffer.concat(chunks);
}

async function fetchUploadFromPeers(
  relativePath: string,
): Promise<Buffer | null> {
  for (const peerBase of UPLOAD_PEER_BASE_URLS) {
    try {
      const response = await fetch(`${peerBase}/${relativePath}`);
      if (!response.ok) {
        continue;
      }

      const data = await response.arrayBuffer();
      return Buffer.from(data);
    } catch {
      continue;
    }
  }

  return null;
}

function isInternalAuthorized(req: express.Request) {
  const adminToken = process.env.INTERNAL_SECRET;

  if (process.env.NODE_ENV === "development" && !adminToken) {
    logger.warn(
      "INTERNAL_SECRET not set — internal endpoints unprotected (development only)",
    );
    return true;
  }

  if (!adminToken) {
    return false;
  }

  const authHeader = req.headers?.authorization;
  if (typeof authHeader !== "string" || !authHeader.startsWith("Bearer ")) {
    return false;
  }

  const providedToken = authHeader.slice("Bearer ".length).trim();
  if (!providedToken.length || providedToken.length !== adminToken.length) {
    return false;
  }
  return crypto.timingSafeEqual(
    Buffer.from(providedToken),
    Buffer.from(adminToken),
  );
}

function roomIdFromUploadRelativePath(relativePath: string) {
  const match = /^rooms\/([^/]+)\//.exec(relativePath);
  return match?.[1] || null;
}

export async function startSocketServer() {
  const app = express();
  const server = createServer(app);
  const port = Number(process.env.PORT) || 3002;

  app.use(cors({
    origin: (origin, callback) => {
      // Mock the resolveCorsOrigin logic for express-cors
      if (!origin) return callback(null, true);
      const allowed = resolveCorsOrigin({ headers: { origin } } as any);
      if (allowed) callback(null, true);
      else callback(new Error("Origin not allowed"));
    }
  }));

  // HEALTH
  app.get("/health", async (req, res) => {
    const health = await getHealthStatus();
    res.status(health.status === "ok" ? 200 : 503).json(health);
  });

  // UPLOAD PUT (Binary)
  app.put(/^\/upload\/(.*)/, createRedisRateLimiter(120, "upload-put"), async (req, res) => {
    const urlPath = req.path;
    const uploadPath = sanitizeUploadPath(urlPath);
    if (!uploadPath) {
      res.status(400).send("Invalid upload path");
      return;
    }

    const authHeader = normalizeHeaderValue(req.headers.authorization);
    const userId = getUserIdFromAuthHeader(authHeader);
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const roomId = roomIdFromUploadRelativePath(uploadPath.relativePath);
    if (!roomId) {
      res.status(400).json({ message: "Invalid upload object key" });
      return;
    }

    try {
      await assertRoomMember(userId, roomId);
    } catch {
      res.status(403).json({ message: "Not a member of this room" });
      return;
    }

    const uploadSignature = normalizeHeaderValue(req.headers["x-upload-token"]);
    const uploadExpiresRaw = normalizeHeaderValue(req.headers["x-upload-expires"]);
    const uploadContentType = normalizeHeaderValue(req.headers["x-upload-content-type"]);
    const contentType = normalizeHeaderValue(req.headers["content-type"]);
    const expiresAt = Number(uploadExpiresRaw || "0");

    if (!uploadSignature || !uploadContentType || !Number.isFinite(expiresAt)) {
      res.status(400).json({ message: "Missing upload signature headers" });
      return;
    }

    if (contentType !== uploadContentType) {
      res.status(400).json({ message: "Content type mismatch" });
      return;
    }

    const validUploadTicket = verifyImageUploadTicketForPut({
      objectKey: uploadPath.relativePath,
      contentType: uploadContentType,
      expiresAt,
      userId,
      signature: uploadSignature,
    });

    if (!validUploadTicket) {
      res.status(403).json({ message: "Invalid or expired upload signature" });
      return;
    }

    try {
      const body = await readRawBody(req);
      await storageService.uploadBuffer(body, uploadPath.relativePath);
      res.writeHead(200, withCorsHeaders(req));
      res.end("OK");
    } catch (error) {
      logger.error({ error }, "Failed to write uploaded image");
      res.writeHead(500, withCorsHeaders(req));
      res.end("Upload failed");
    }
  });

  // UPLOAD GET (SECURED)
  app.get(/^\/upload\/(.*)/, async (req, res) => {
    const urlPath = req.path;
    const uploadPath = sanitizeUploadPath(urlPath);
    if (!uploadPath) {
      res.status(400).send("Invalid path");
      return;
    }

    const authHeader = normalizeHeaderValue(req.headers.authorization);
    const userId = getUserIdFromAuthHeader(authHeader);
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const roomId = roomIdFromUploadRelativePath(uploadPath.relativePath);
    if (roomId) {
      try {
        await assertRoomMember(userId, roomId);
      } catch {
        res.status(403).json({ message: "Not a member of this room" });
        return;
      }
    }

    if (req.method === "GET") {
      try {
        const stream = storageService.getDownloadStream(uploadPath.relativePath);
        res.writeHead(
          200,
          withCorsHeaders(req, {
            "content-type": uploadPath.mimeType,
            "cache-control": "public, max-age=31536000, immutable",
          }),
        );
        stream.pipe(res);
        stream.on("error", (err: any) => {
          logger.error({ err }, "Storage stream error");
          if (!res.headersSent) {
            res.writeHead(404, withCorsHeaders(req));
            res.end("Not Found");
          }
        });
      } catch (error) {
        res.writeHead(404, withCorsHeaders(req));
        res.end("Not Found");
      }
      return;
    }
  });

  // UPLOAD URL REQUEST
  app.post("/upload-url", createRedisRateLimiter(30, "upload-url"), async (req, res) => {
    await handleUploadUrlRequest(req as any, res as any);
  });

  // INTERNAL
  app.get("/internal/status", async (req, res) => {
    if (!isInternalAuthorized(req)) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
    const status = await getInternalStatus();
    res.status(200).json(status);
  });

  app.get("/internal/replay-check", async (req, res) => {
    if (!isInternalAuthorized(req)) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const roomId = req.query.roomId as string;
    const limit = Number(req.query.limit || 200);

    if (!roomId) {
      res.status(400).json({ message: "roomId is required" });
      return;
    }

    const result = await runReplayCheck(roomId, limit);
    res.status(200).json(result);
  });

  const wss = new WebSocketServer({
    noServer: true,
  });

  server.on("upgrade", (request, socket, head) => {
    const origin = resolveCorsOrigin(request);
    if (request.headers.origin && !origin) {
      socket.destroy();
      return;
    }

    const parsed = request.url
      ? new URL(request.url, "http://localhost")
      : null;
    const wsPath = parsed?.pathname || "/";
    if (wsPath !== "/" && wsPath !== "/ws") {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      socketManager.handleConnection(ws, request);
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(port, resolve);
  });

  logger.info({ port }, "WebSocket server running");
  return server;
}
