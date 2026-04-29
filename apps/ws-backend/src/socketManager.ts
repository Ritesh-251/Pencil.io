import { IncomingMessage } from "http";
import WebSocket from "ws";
import { verifySocketToken } from "./auth/auth.middleware";
import { AuthenticatedSocket } from "./types/socket";
import { EventRouter } from "./router/eventRouter";
import { roomManager } from "./manager/roomManager";
import { randomUUID } from "crypto";
import { safePublish } from "./infra/redis";
import { isOverloaded } from "./monitor/systemLoad";
import { logger } from "./infra/logger";
import {
  recordBackpressureTrigger,
  recordError,
  recordIngress,
} from "./monitor/metrics";
import { sendSocketCodedError, sendSocketError } from "./utils/socket.util";

type RateEntry = {
  count: number;
  start: number;
};

const RATE_LIMIT_PER_SEC = Number(process.env.WS_RATE_LIMIT_PER_SEC || 300);
const RATE_WINDOW_MS = 1000;
// BUG-1: Auth timeout — close the socket if the handshake doesn't arrive in time
const AUTH_TIMEOUT_MS = 10_000;
const WRITE_EVENTS = new Set([
  "chat:send",
  "canvas:draw",
  "canvas:undo",
  "canvas:redo",
]);

export class SocketManager {
  private router = new EventRouter();
  private rateMap: Map<string, RateEntry> = new Map();

  handleConnection(socket: WebSocket, request: IncomingMessage) {
    const ws = socket as AuthenticatedSocket;
    ws.id = randomUUID();
    ws.isAuthenticating = false;

    const authTimeout = setTimeout(() => {
      if (!ws.userId) {
        logger.warn({ socketId: ws.id }, "Socket auth timeout — closing");
        ws.close(4401, "Authentication timeout");
      }
    }, AUTH_TIMEOUT_MS);

    ws.on("message", (data) => {
      const messageStr = data.toString();

      // If the user isn't authenticated yet, the first message MUST be auth
      if (!ws.userId) {
        if (ws.isAuthenticating) {
          logger.warn(
            { socketId: ws.id },
            "Auth already in progress — ignoring message",
          );
          return;
        }
        ws.isAuthenticating = true;
        void this.handleAuthHandshake(ws, messageStr, authTimeout).catch(
          (err) => {
            ws.isAuthenticating = false;
            recordError();
            logger.warn(
              { err, socketId: ws.id },
              "Socket auth handshake failed",
            );
            ws.close(4401, "Unauthorized");
          },
        );
        return;
      }

      void this.handleMessage(ws, messageStr).catch((err) => {
        recordError();
        logger.error(
          { err, userId: ws.userId, socketId: ws.id },
          "Message handling error",
        );
      });
    });

    ws.on("close", () => {
      clearTimeout(authTimeout);
      if (ws.userId) {
        void this.handleDisconnect(ws).catch((err) => {
          recordError();
          logger.error(
            { err, userId: ws.userId, socketId: ws.id },
            "Socket disconnect handling error",
          );
        });
      }
    });

    ws.on("error", (err) => {
      logger.error({ err, userId: ws.userId, socketId: ws.id }, "Socket error");
    });
  }

  // BUG-1 FIX: Auth handshake — verifies the token sent as the first message.
  private async handleAuthHandshake(
    socket: AuthenticatedSocket,
    raw: string,
    authTimeout: ReturnType<typeof setTimeout>,
  ) {
    clearTimeout(authTimeout);

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      socket.close(4400, "Invalid JSON");
      return;
    }

    if (parsed?.type !== "auth" || typeof parsed?.payload?.token !== "string") {
      socket.close(4401, "Expected auth message");
      return;
    }

    let userId: string;
    try {
      userId = verifySocketToken(parsed.payload.token);
    } catch {
      socket.close(4401, "Invalid token");
      return;
    }

    socket.userId = userId;
    socket.isAuthenticating = false;
    logger.info(
      { userId: socket.userId, socketId: socket.id },
      "Socket authenticated",
    );
    // Confirm auth so the client can flush its pending-message queue
    socket.send(JSON.stringify({ type: "auth:ok", payload: {} }));
  }

  private async handleMessage(socket: AuthenticatedSocket, raw: string) {
    if (raw.length > 10_000) {
      socket.close();
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      const type =
        typeof parsed?.type === "string"
          ? parsed.type
          : typeof parsed?.event === "string"
            ? parsed.event
            : undefined;

      if (!type) {
        throw new Error("Invalid message format");
      }

      const normalizedEvent = {
        type,
        payload: parsed?.payload,
      };

      recordIngress();

      this.checkRateLimit(socket.id!);

      if (isOverloaded() && WRITE_EVENTS.has(normalizedEvent.type)) {
        recordBackpressureTrigger();
        sendSocketCodedError(
          socket,
          "BACKPRESSURE",
          "System overloaded. Reads are still available.",
        );
        return;
      }

      await this.router.route(socket, normalizedEvent);
    } catch (error) {
      recordError();

      const message =
        error instanceof Error ? error.message : "Invalid message format";
      const isRateLimit = message.includes("Rate limit");

      if (isRateLimit) {
        sendSocketCodedError(socket, "RATE_LIMIT", "Rate limit exceeded");
      } else {
        sendSocketError(socket, "Invalid message format");
      }

      logger.warn(
        { userId: socket.userId, error: message },
        "Socket message rejected",
      );
    }
  }

  private checkRateLimit(socketId: string) {
    const now = Date.now();
    const current = this.rateMap.get(socketId) || { count: 0, start: now };

    if (now - current.start > RATE_WINDOW_MS) {
      current.start = now;
      current.count = 0;
    }

    current.count += 1;
    this.rateMap.set(socketId, current);

    if (current.count > RATE_LIMIT_PER_SEC) {
      throw new Error("Rate limit exceeded");
    }
  }

  private async handleDisconnect(socket: AuthenticatedSocket) {
    const rooms = roomManager.getRooms(socket);
    const roomIds = rooms ? Array.from(rooms) : [];

    // BUG-5 FIX: Remove the socket from all rooms BEFORE broadcasting so the
    // disconnecting user does not receive its own "offline" event.
    const offlineRoomIds = roomManager.removeSocket(socket) || [];
    if (socket.id) {
      this.rateMap.delete(socket.id);
    }

    const eventPayload = {
      type: "presence:update",
      payload: {
        userId: socket.userId,
        status: "offline",
      },
    };

    for (const roomId of offlineRoomIds.length > 0 ? offlineRoomIds : roomIds) {
      roomManager.broadCast(roomId, eventPayload);
      await safePublish({
        type: "presence:update",
        roomId,
        payload: eventPayload.payload,
      });
    }

    logger.info(
      { userId: socket.userId, socketId: socket.id },
      "Socket disconnected",
    );
  }
}
