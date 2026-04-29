import { roomManager } from "../manager/roomManager";
import { AuthenticatedSocket } from "../types/socket";
import { sendSocketError } from "../utils/socket.util";

export const handleTyping = (socket: AuthenticatedSocket, payload: any) => {
  if (!payload || typeof payload !== "object") {
    return sendSocketError(socket, "Invalid payload");
  }
  const { roomId } = payload;
  if (!roomId) return sendSocketError(socket, "roomId is required");
  if (!roomManager.isSocketInRoom(socket, roomId)) {
    return sendSocketError(socket, "User is not in room");
  }

  roomManager.broadCast(roomId, {
    type: "chat:typing",
    payload: { userId: socket.userId },
  });
};

export const handleStopTyping = (socket: AuthenticatedSocket, payload: any) => {
  if (!payload || typeof payload !== "object") {
    return sendSocketError(socket, "Invalid payload");
  }
  const { roomId } = payload;
  if (!roomId) return sendSocketError(socket, "roomId is required");
  if (!roomManager.isSocketInRoom(socket, roomId)) {
    return sendSocketError(socket, "User is not in room");
  }

  roomManager.broadCast(roomId, {
    type: "chat:stop_typing",
    payload: { userId: socket.userId },
  });
};
