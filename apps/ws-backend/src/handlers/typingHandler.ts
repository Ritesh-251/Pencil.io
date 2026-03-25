import { roomManager } from "../manager/roomManager";
import { AuthenticatedSocket } from "../types/socket";

function sendError(socket: AuthenticatedSocket, message: string) {
  socket.send(
    JSON.stringify({
      type: "error",
      payload: { message },
    }),
  );
}
export const handleTyping = (socket: AuthenticatedSocket, payload: any) => {
  if (!payload || typeof payload !== "object") {
    return sendError(socket, "Invalid payload");
  }

  const { roomId } = payload;

  if (!roomId) {
    return sendError(socket, "roomId is required");
  }

  roomManager.broadcast(roomId, {
    type: "chat:typing",
    payload: {
      userId: socket.userId,
    },
  });
};

export const handleStopTyping = (socket: AuthenticatedSocket, payload: any) => {
  if (!payload || typeof payload !== "object") {
    return sendError(socket, "Invalid payload");
  }

  const { roomId } = payload;

  if (!roomId) {
    return sendError(socket, "roomId is required");
  }

  roomManager.broadCast(roomId, {
    type: "chat:stop_typing",
    payload: {
      userId: socket.userId,
    },
  });
};
