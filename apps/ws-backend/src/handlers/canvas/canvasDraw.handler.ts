import { pubsub } from "../../infra/redis";
import { roomManager } from "../../manager/roomManager";
import { AuthenticatedSocket } from "../../types/socket";

function sendError(socket: AuthenticatedSocket, message: string) {
  socket.send(
    JSON.stringify({
      type: "error",
      payload: { message },
    }),
  );
}

export async function canvasDraw(socket: AuthenticatedSocket, payload: any) {
  if (!payload || typeof payload !== "object") {
    return sendError(socket, "Invalid payload");
  }
  const { roomId, strokeId, points, color, width } = payload;
  if (!roomId) {
    return sendError(socket, "roomId is required");
  }

  if (!strokeId || typeof strokeId !== "string") {
    return sendError(socket, "strokeId is required");
  }

  if (!Array.isArray(points) || points.length === 0) {
    return sendError(socket, "points are required");
  }
  if (points.length > 50) {
    return;
  }
  const event = {
    type: "canvas:draw",
    payload: {
      strokeId,
      points,
      color,
      width,
      userId: socket.userId,
    },
  };
  roomManager.broadCast(roomId, event);
  try {
    await pubsub.publish({
      type: "canvas:draw",
      roomId,
      payload: event.payload,
    });
  } catch (err) {
    console.error("Canvas Redis publish failed:", err);
  }
}
