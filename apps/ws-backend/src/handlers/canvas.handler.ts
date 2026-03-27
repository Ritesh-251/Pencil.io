import { AuthenticatedSocket } from "../types/socket"
import { createCanvasObjectEvent } from "../events/canvas/canvas.event"
import { canvasService } from "../services/canvas.service"
import { eventPublisher } from "../infra/eventPublisher"

function sendError(socket: AuthenticatedSocket, message: string) {
  socket.send(JSON.stringify({ type: "error", payload: { message } }))
}

export async function handleCanvasObject(
  socket: AuthenticatedSocket,
  payload: any
) {
  

  const { roomId, objectId, action, data } = payload

  if (!roomId || !objectId || !action) {
    return sendError(socket, "Invalid payload")
  }

  const event = createCanvasObjectEvent({
    roomId,
    userId: socket.userId!,
    objectId,
    type: action,
    data,
  })


  const validationError = canvasService.validateStroke(event)
  if (validationError) return sendError(socket, validationError)

  try {
    await eventPublisher.publish(event)
  } catch (err) {
    console.error("Canvas publish error:", err)
    sendError(socket, "Internal server error")
  }
}
