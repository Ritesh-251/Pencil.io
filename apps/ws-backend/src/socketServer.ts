import { createServer } from "http";
import { WebSocketServer } from "ws";
import { SocketManager } from "./socketManager";
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

const requestCounters = new Map<string, { count: number; resetAt: number }>();
const MAX_REQUEST_COUNTER_KEYS = Number(
  process.env.MAX_REQUEST_COUNTER_KEYS || 50_000,
);

function getClientIp(req: any) {
  const forwarded = req.headers?.["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }

  return req.socket?.remoteAddress || "unknown";
}

function cleanupRequestCounters(now: number) {
  for (const [key, value] of requestCounters.entries()) {
    if (value.resetAt <= now) {
      requestCounters.delete(key);
    }
  }

  if (requestCounters.size <= MAX_REQUEST_COUNTER_KEYS) {
    return;
  }

  const overflow = requestCounters.size - MAX_REQUEST_COUNTER_KEYS;
  let removed = 0;
  for (const key of requestCounters.keys()) {
    requestCounters.delete(key);
    removed += 1;
    if (removed >= overflow) break;
  }
}

function isRateLimited(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  cleanupRequestCounters(now);
  const current = requestCounters.get(key);

  if (!current || current.resetAt <= now) {
    requestCounters.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }

  if (current.count >= limit) {
    return true;
  }

  current.count += 1;
  requestCounters.set(key, current);
  return false;
}

function sendJson(req: any, res: any, statusCode: number, body: unknown) {
  res.writeHead(
    statusCode,
    withCorsHeaders(req, { "content-type": "application/json" }),
  );
  res.end(JSON.stringify(body));
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
  req: any,
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

function isInternalAuthorized(req: any) {
  const adminToken = process.env.INTERNAL_SECRET;

  // SEC-3 FIX: Development mode no longer grants blanket access.
  // If a token is configured we always check it, regardless of NODE_ENV.
  // Without a token in development we log a warning and allow through so
  // local tooling still works, but an accidental NODE_ENV=development in
  // staging with a configured token is still protected.
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
  return providedToken.length > 0 && providedToken === adminToken;
}

function roomIdFromUploadRelativePath(relativePath: string) {
  const match = /^rooms\/([^/]+)\//.exec(relativePath);
  return match?.[1] || null;
}

export async function startSocketServer() {
  const port = Number(process.env.PORT) || 3002;
  const server = createServer(async (req, res) => {
    const origin = resolveCorsOrigin(req);
    if (req.headers.origin && !origin) {
      res.writeHead(403, { "content-type": "text/plain" });
      res.end("Origin not allowed");
      return;
    }

    if (!req.url) {
      res.writeHead(400, withCorsHeaders(req));
      res.end("Bad Request");
      return;
    }

    if (req.method === "OPTIONS") {
      res.writeHead(204, withCorsHeaders(req));
      res.end();
      return;
    }

    const parsedUrl = new URL(req.url, "http://localhost");

    if (parsedUrl.pathname.startsWith("/upload/")) {
      const uploadPath = sanitizeUploadPath(parsedUrl.pathname);
      if (!uploadPath) {
        res.writeHead(400, withCorsHeaders(req));
        res.end("Invalid upload path");
        return;
      }

      if (req.method === "PUT") {
        const clientIp = getClientIp(req);
        if (isRateLimited(`upload-put:${clientIp}`, 120, 60_000)) {
          sendJson(req, res, 429, { message: "Too many upload PUT requests" });
          return;
        }

        const authHeader = normalizeHeaderValue(req.headers.authorization);
        const userId = getUserIdFromAuthHeader(authHeader);
        if (!userId) {
          sendJson(req, res, 401, { message: "Unauthorized" });
          return;
        }

        const roomId = roomIdFromUploadRelativePath(uploadPath.relativePath);
        if (!roomId) {
          sendJson(req, res, 400, { message: "Invalid upload object key" });
          return;
        }

        try {
          await assertRoomMember(userId, roomId);
        } catch {
          sendJson(req, res, 403, { message: "Not a member of this room" });
          return;
        }

        const uploadSignature = normalizeHeaderValue(
          req.headers["x-upload-token"],
        );
        const uploadExpiresRaw = normalizeHeaderValue(
          req.headers["x-upload-expires"],
        );
        const uploadContentType = normalizeHeaderValue(
          req.headers["x-upload-content-type"],
        );
        const contentType = normalizeHeaderValue(req.headers["content-type"]);
        const expiresAt = Number(uploadExpiresRaw || "0");

        if (
          !uploadSignature ||
          !uploadContentType ||
          !Number.isFinite(expiresAt)
        ) {
          sendJson(req, res, 400, {
            message: "Missing upload signature headers",
          });
          return;
        }

        if (contentType !== uploadContentType) {
          sendJson(req, res, 400, { message: "Content type mismatch" });
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
          sendJson(req, res, 403, {
            message: "Invalid or expired upload signature",
          });
          return;
        }

        try {
          const body = await readRawBody(req);
          const dir = path.dirname(uploadPath.absolutePath);
          await fs.promises.mkdir(dir, { recursive: true });
          await fs.promises.writeFile(uploadPath.absolutePath, body);
          res.writeHead(200, withCorsHeaders(req));
          res.end("OK");
        } catch (error) {
          logger.error({ error }, "Failed to write uploaded image");
          res.writeHead(500, withCorsHeaders(req));
          res.end("Upload failed");
        }
        return;
      }

      if (req.method === "GET") {
        if (!fs.existsSync(uploadPath.absolutePath)) {
          const remoteData = await fetchUploadFromPeers(
            uploadPath.relativePath,
          );
          if (!remoteData) {
            res.writeHead(404, withCorsHeaders(req));
            res.end("Not Found");
            return;
          }

          const dir = path.dirname(uploadPath.absolutePath);
          await fs.promises.mkdir(dir, { recursive: true });
          await fs.promises.writeFile(uploadPath.absolutePath, remoteData);
        }

        const stream = fs.createReadStream(uploadPath.absolutePath);
        res.writeHead(
          200,
          withCorsHeaders(req, {
            "content-type": uploadPath.mimeType,
            "cache-control": "public, max-age=31536000, immutable",
          }),
        );
        stream.pipe(res);
        return;
      }

      res.writeHead(405, withCorsHeaders(req));
      res.end("Method Not Allowed");
      return;
    }

    if (parsedUrl.pathname === "/upload-url" && req.method === "POST") {
      const clientIp = getClientIp(req);
      if (isRateLimited(`upload:${clientIp}`, 30, 60_000)) {
        sendJson(req, res, 429, { message: "Too many upload-url requests" });
        return;
      }

      await handleUploadUrlRequest(req as any, res as any);
      return;
    }

    if (parsedUrl.pathname === "/health") {
      const health = await getHealthStatus();
      sendJson(req, res, health.status === "ok" ? 200 : 503, health);
      return;
    }

    if (parsedUrl.pathname === "/internal/status") {
      if (!isInternalAuthorized(req)) {
        sendJson(req, res, 401, { message: "Unauthorized" });
        return;
      }

      const status = await getInternalStatus();
      sendJson(req, res, 200, status);
      return;
    }

    if (parsedUrl.pathname === "/internal/replay-check") {
      if (!isInternalAuthorized(req)) {
        sendJson(req, res, 401, { message: "Unauthorized" });
        return;
      }

      const roomId = parsedUrl.searchParams.get("roomId");
      const limit = Number(parsedUrl.searchParams.get("limit") || 200);

      if (!roomId) {
        sendJson(req, res, 400, { message: "roomId is required" });
        return;
      }

      const result = await runReplayCheck(roomId, limit);
      sendJson(req, res, 200, result);
      return;
    }

    res.writeHead(404, withCorsHeaders(req));
    res.end("Not Found");
  });

  const wss = new WebSocketServer({
    noServer: true,
  });
  const socketManager = new SocketManager();

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
  // Q-12: Return the server so the caller can close it gracefully on SIGTERM.
  return server;
}
