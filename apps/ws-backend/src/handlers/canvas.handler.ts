import { AuthenticatedSocket } from "../types/socket"
import { createDrawStrokeEvent } from "../events/canvas/canvas.event"
import { canvasService } from "../services/canvas.service"
import { eventPublisher } from "../infra/eventPublisher"

function sendError(socket: AuthenticatedSocket, message: string) {
  socket.send(JSON.stringify({ type: "error", payload: { message } }))
}

export async function handleCanvasDraw(
  socket: AuthenticatedSocket,
  payload: any
) {
  if (!payload || typeof payload !== "object") {
    return sendError(socket, "Invalid payload")
  }

  const { roomId, strokeId, points, color, width } = payload

  if (!roomId) return sendError(socket, "roomId is required")

  const event = createDrawStrokeEvent({
    roomId,
    userId: socket.userId!,
    strokeId,
    points,
    color,
    width,
  })

  const validationError = canvasService.validateStroke(event)
  if (validationError) return sendError(socket, validationError)

  try {
    await eventPublisher.publish({
      id: event.eventId,
      type: "canvas.draw",
      roomId: event.roomId,
      userId: event.userId,
      timestamp: event.timestamp,
      version: 1,
      payload: {
        strokeId: event.strokeId,
        points: event.points,
        color: event.color,
        width: event.width,
      },
    })
  } catch (err) {
    console.error("Canvas publish error:", err)
    sendError(socket, "Internal server error")
  }
}
