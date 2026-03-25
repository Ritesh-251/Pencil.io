import { IncomingMessage } from "http";
import WebSocket from "ws";
import { verifySocketToken } from "./auth/auth.middleware";
import { AuthenticatedSocket } from "./types/socket";
import { EventRouter } from "./router/eventRouter";
import { roomManager } from "./manager/roomManager";
import { randomUUID } from "crypto";
import { URL } from "url";
import { pubsub } from "./infra/redis";

export class SocketManager {
  private router = new EventRouter();

  handleConnection(socket: WebSocket, request: IncomingMessage) {
    const ws = socket as AuthenticatedSocket;
    try {
      const userId = this.authenticate(request);

      ws.userId = userId;
      ws.id = randomUUID();

      console.log("Socket connected:", {
        userId: ws.userId,
        socketId: ws.id,
      });

      ws.on("message", (data) => {
        this.handleMessage(ws, data.toString()).catch((err) => {
          console.error("Message handling error:", err);
        });
      });

      ws.on("close", () => {
        this.handleDisconnect(ws);
      });
      ws.on("error", (err) => {
        console.error("Socket error:", err);
      });
    } catch (err) {
      console.log("Socket authentication failed");
      ws.close();
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

      await this.router.route(socket, parsed);
    } catch (error) {
      console.log("Invalid socket message from:", socket.userId);
      socket.send(
        JSON.stringify({
          type: "error",
          payload: { message: "Invalid message format" },
        }),
      );
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

    if (rooms) {
      for (const roomId of rooms) {
        roomManager.broadCast(roomId, eventPayload);
        await pubsub.publish({
          type: "presence:update",
          roomId,
          payload: eventPayload,
        });
      }
    }

    roomManager.removeSocket(socket);

    console.log("Socket disconnected:", socket.userId);
  }
}
