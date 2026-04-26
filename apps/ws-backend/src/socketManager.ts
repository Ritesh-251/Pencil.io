import { IncomingMessage } from "http";
import WebSocket from "ws";
import { verifySocketToken } from "./auth/auth.middleware";
import { AuthenticatedSocket } from "./types/socket";
import { EventRouter } from "./router/eventRouter";
import { roomManager } from "./manager/roomManager";
import { randomUUID } from "crypto";
import { URL } from "url";
import { safePublish } from "./infra/redis";
import { isOverloaded } from "./monitor/systemLoad";
import { logger } from "./infra/logger";
import { recordBackpressureTrigger, recordError, recordIngress } from "./monitor/metrics";
import { sendSocketCodedError, sendSocketError } from "./utils/socket.util";

type RateEntry = {
  count: number
  start: number
}

const RATE_LIMIT_PER_SEC = Number(process.env.WS_RATE_LIMIT_PER_SEC || 300)
const RATE_WINDOW_MS = 1000
const WRITE_EVENTS = new Set([
  "chat:send",
  "canvas:draw",
  "canvas:undo",
  "canvas:redo",
])

export class SocketManager {
  private router = new EventRouter();
  private rateMap: Map<string, RateEntry> = new Map();

  handleConnection(socket: WebSocket, request: IncomingMessage) {
    const ws = socket as AuthenticatedSocket;
    try {
      const userId = this.authenticate(request);

      ws.userId = userId;
      ws.id = randomUUID();

      logger.info({
        userId: ws.userId,
        socketId: ws.id,
      }, "Socket connected")

      ws.on("message", (data) => {
        this.handleMessage(ws, data.toString()).catch((err) => {
          recordError()
          logger.error({ err, userId: ws.userId, socketId: ws.id }, "Message handling error");
        });
      });

      ws.on("close", () => {
        void this.handleDisconnect(ws).catch((err) => {
          recordError();
          logger.error({ err, userId: ws.userId, socketId: ws.id }, "Socket disconnect handling error");
        });
      });
      ws.on("error", (err) => {
        logger.error({ err, userId: ws.userId, socketId: ws.id }, "Socket error")
      });
    } catch (err) {
      recordError()
      logger.warn({ err }, "Socket authentication failed");
      ws.close(4401, "Unauthorized");
    }
  }
  private authenticate(req: IncomingMessage) {
    if (!req.url) throw new Error("Invalid request URL");
    const url = new URL(req.url, "http://localhost");
    const token = url.searchParams.get("token");
    if (!token) {
      throw new Error("Missing token");
    }
    const userId = verifySocketToken(token);

    if (!userId) {
      throw new Error("Invalid token");
    }

    return userId;
  }
  private async handleMessage(socket: AuthenticatedSocket, raw: string) {
    if (raw.length > 10_000) {
      socket.close();
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      const type = typeof parsed?.type === "string"
        ? parsed.type
        : (typeof parsed?.event === "string" ? parsed.event : undefined)

      if (!type) {
        throw new Error("Invalid message format")
      }

      const normalizedEvent = {
        type,
        payload: parsed?.payload,
      }

      recordIngress()

      this.checkRateLimit(socket.id!)

      if (isOverloaded() && WRITE_EVENTS.has(normalizedEvent.type)) {
        recordBackpressureTrigger()
        sendSocketCodedError(
          socket,
          "BACKPRESSURE",
          "System overloaded. Reads are still available.",
        )
        return
      }

      await this.router.route(socket, normalizedEvent);
    } catch (error) {
      recordError()

      const message = error instanceof Error ? error.message : "Invalid message format"
      const isRateLimit = message.includes("Rate limit")

      if (isRateLimit) {
        sendSocketCodedError(socket, "RATE_LIMIT", "Rate limit exceeded")
      } else {
        sendSocketError(socket, "Invalid message format")
      }

      logger.warn({ userId: socket.userId, error: message }, "Socket message rejected")
    }
  }

  private checkRateLimit(socketId: string) {
    const now = Date.now()
    const current = this.rateMap.get(socketId) || { count: 0, start: now }

    if (now - current.start > RATE_WINDOW_MS) {
      current.start = now
      current.count = 0
    }

    current.count += 1
    this.rateMap.set(socketId, current)

    if (current.count > RATE_LIMIT_PER_SEC) {
      throw new Error("Rate limit exceeded")
    }
  }
  private async handleDisconnect(socket: AuthenticatedSocket) {
    const rooms = roomManager.getRooms(socket);
    const eventPayload = {
      type: "presence:update",
      payload: {
        userId: socket.userId,
        status: "offline",
      },
    };

    try {
      if (rooms) {
        for (const roomId of rooms) {
          roomManager.broadCast(roomId, eventPayload);
          await safePublish({
            type: "presence:update",
            roomId,
            payload: eventPayload,
          });
        }
      }
    } finally {
      roomManager.removeSocket(socket);
      if (socket.id) {
        this.rateMap.delete(socket.id)
      }
    }

    logger.info({ userId: socket.userId, socketId: socket.id }, "Socket disconnected")
  }
}
