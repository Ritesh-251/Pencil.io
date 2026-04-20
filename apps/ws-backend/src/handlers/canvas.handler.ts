import { AuthenticatedSocket } from "../types/socket"
import { createCanvasObjectEvent } from "../events/canvas/canvas.event"
import { canvasService } from "../services/canvas.service"
import { BackpressureError, eventPublisher } from "../infra/eventPublisher"
import { logger } from "../infra/logger"
import { sendSocketCodedError, sendSocketError } from "../utils/socket.util"
import { assertRoomMember, isRoomAccessDeniedError } from "../services/roomAccess.service"

export async function handleCanvasObject(
  socket: AuthenticatedSocket,
  payload: any
) {
  

  const { roomId, objectId, action, data } = payload

  if (!roomId || !objectId || !action) {
    return sendSocketError(socket, "Invalid payload")
  }

  const validationError = canvasService.validateObject(action, data)
  if (validationError) return sendSocketError(socket, validationError)

  const event = createCanvasObjectEvent({
    roomId,
    userId: socket.userId!,
    objectId,
    type: action,
    data,
  })

  try {
    await assertRoomMember(socket.userId!, roomId)
    await eventPublisher.publish(event)
  } catch (err) {
    if (isRoomAccessDeniedError(err)) {
      return sendSocketError(socket, "Not a member of this room")
    }

    logger.error({ err, roomId, userId: socket.userId, objectId }, "Canvas publish error")

    if (err instanceof BackpressureError) {
      return sendSocketCodedError(
        socket,
        "BACKPRESSURE",
        "System overloaded. Try again shortly.",
        {
          retryAfterMs: 1000,
          strategy: "retry-with-backoff-and-local-buffer",
        },
      )
    }

    sendSocketError(socket, "Internal server error")
  }
}
