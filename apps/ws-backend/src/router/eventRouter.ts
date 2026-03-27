import { AuthenticatedSocket } from "../types/socket";
import { SocketEvent } from "../types/event";

import { handleRoomJoin, handleRoomLeave } from "../handlers/room.handler";
import { handleChatSend } from "../handlers/chat.handler";
import { handleChatHistory } from "../handlers/chatHistory.handler";
import { handleStopTyping, handleTyping } from "../handlers/typing.handler";
import { handleCanvasObject } from "../handlers/canvas.handler";
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
          await handleRoomJoin(socket, event.payload);
          break;
        case "room:leave":
          await handleRoomLeave(socket, event.payload);
          break;
        case "chat:send":
          await handleChatSend(socket, event.payload);
          break;
        case "chat:history":
          await handleChatHistory(socket, event.payload);
          break;
        case "chat:typing":
          handleTyping(socket, event.payload);
          break;

        case "chat:stop_typing":
          handleStopTyping(socket, event.payload);
          break;
        case "canvas:draw":
          return handleCanvasObject(socket, event);

        default:
          this.sendError(socket, `Unknown event: ${event.type}`);
      }
    } catch (error) {
      console.error("Router error:", error);

      this.sendError(socket, "Internal server error");
    }
  }
  private handlePing(socket: AuthenticatedSocket) {
    socket.send(
      JSON.stringify({
        type: "pong",
        payload: {},
      }),
    );
  }
  private sendError(socket: AuthenticatedSocket, message: string) {
    socket.send(
      JSON.stringify({
        type: "error",
        payload: { message },
      }),
    );
  }
}
