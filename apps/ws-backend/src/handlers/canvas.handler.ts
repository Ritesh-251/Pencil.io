import { AuthenticatedSocket } from "../types/socket";
import { createCanvasObjectEvent } from "../events/canvas/canvas.event";
import { canvasService } from "../services/canvas.service";
import { BackpressureError, eventPublisher } from "../infra/eventPublisher";
import { logger } from "../infra/logger";
import { sendSocketCodedError, sendSocketError } from "../utils/socket.util";
import { roomManager } from "../manager/roomManager";

export async function handleCanvasObject(
  socket: AuthenticatedSocket,
  payload: any,
) {
  if (!socket.userId) {
    return sendSocketError(socket, "Unauthorized");
  }

  const { roomId, objectId, action, data } = payload;

  if (!roomId || !objectId || !action) {
    return sendSocketError(socket, "Invalid payload");
  }

  const validationError = canvasService.validateObject(action, data);
  if (validationError) return sendSocketError(socket, validationError);

  if (!roomManager.isSocketInRoom(socket, roomId)) {
    return sendSocketError(socket, "Not a member of this room");
  }

  const event = createCanvasObjectEvent({
    roomId,
    userId: socket.userId,
    objectId,
    type: action,
    data,
  });

  try {
    await eventPublisher.publish(event);
  } catch (err) {
    logger.error(
      { err, roomId, userId: socket.userId, objectId },
      "Canvas publish error",
    );

    if (err instanceof BackpressureError) {
      return sendSocketCodedError(
        socket,
        "BACKPRESSURE",
        "System overloaded. Try again shortly.",
        {
          retryAfterMs: 1000,
          strategy: "retry-with-backoff-and-local-buffer",
        },
      );
    }

    sendSocketError(socket, "Internal server error");
  }
}
