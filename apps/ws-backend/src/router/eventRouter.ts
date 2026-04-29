import { AuthenticatedSocket } from "../types/socket";
import { SocketEvent } from "../types/event";

import { handleRoomJoin, handleRoomLeave } from "../handlers/room.handler";
import { handleChatSend } from "../handlers/chat.handler";
import { handleChatHistory } from "../handlers/chatHistory.handler";
import { handleStopTyping, handleTyping } from "../handlers/typing.handler";

import { handleCanvasObject } from "../handlers/canvas.handler";
import { handleCanvasReplay } from "../handlers/canvasReplay.handler";
import { handleCanvasUndo } from "../handlers/canvasUndo.handler";
import { handleCanvasRedo } from "../handlers/canvasRedo.handler";
import { handleCanvasLoad } from "../handlers/canvasLoad.handler";
import { recordError } from "../monitor/metrics";
import { logger } from "../infra/logger";
import { sendSocketError } from "../utils/socket.util";

export class EventRouter {
  async route(socket: AuthenticatedSocket, event: SocketEvent) {
    if (!event.type) {
      this.sendError(socket, "Missing event type");
      return;
    }

    try {
      switch (event.type) {
        case "ping":
          this.handlePing(socket);
          break;

        case "room:join":
          void handleRoomJoin(socket, event.payload).catch((error) =>
            this.handleAsyncError(socket, error),
          );
          break;

        case "room:leave":
          void handleRoomLeave(socket, event.payload).catch((error) =>
            this.handleAsyncError(socket, error),
          );
          break;

        case "chat:send":
          void handleChatSend(socket, event.payload).catch((error) =>
            this.handleAsyncError(socket, error),
          );
          break;

        case "chat:history":
          void handleChatHistory(socket, event.payload).catch((error) =>
            this.handleAsyncError(socket, error),
          );
          break;

        case "chat:typing":
          handleTyping(socket, event.payload);
          break;

        case "chat:stop_typing":
          handleStopTyping(socket, event.payload);
          break;

        case "canvas:draw":
          void handleCanvasObject(socket, event.payload).catch((error) =>
            this.handleAsyncError(socket, error),
          );
          break;

        case "canvas:undo":
          void handleCanvasUndo(socket, event.payload).catch((error) =>
            this.handleAsyncError(socket, error),
          );
          break;

        case "canvas:redo":
          void handleCanvasRedo(socket, event.payload).catch((error) =>
            this.handleAsyncError(socket, error),
          );
          break;

        case "canvas:replay":
          void handleCanvasReplay(socket, event.payload).catch((error) =>
            this.handleAsyncError(socket, error),
          );
          break;

        case "auth":
          // Ignore redundant auth messages after successful URL-based auth
          break;

        case "canvas:sync":
          void handleCanvasLoad(socket, {
            roomId: event.payload?.roomId,
            fromTime: event.payload?.lastKnownTimestamp,
          }).catch((error) => this.handleAsyncError(socket, error));
          break;

        default:
          this.sendError(socket, `Unknown event: ${event.type}`);
      }
    } catch (error) {
      recordError();
      logger.error({ err: error }, "Router error");
      this.sendError(socket, "Internal server error");
    }
  }

  private handlePing(socket: AuthenticatedSocket) {
    socket.send(
      JSON.stringify({
        type: "pong",
        event: "pong",
        payload: {},
      }),
    );
  }

  private sendError(socket: AuthenticatedSocket, message: string) {
    sendSocketError(socket, message);
  }

  private handleAsyncError(socket: AuthenticatedSocket, error: unknown) {
    recordError();
    logger.error({ err: error }, "Router async error");
    this.sendError(socket, "Internal server error");
  }
}
