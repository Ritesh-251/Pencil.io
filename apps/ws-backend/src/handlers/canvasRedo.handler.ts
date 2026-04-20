import { BackpressureError, eventPublisher } from "../infra/eventPublisher"
import { AuthenticatedSocket } from "../types/socket"
import crypto from "crypto"
import { generateHLC } from "../crdt/hlc"
import { sendSocketCodedError, sendSocketError } from "../utils/socket.util"
import { assertRoomMember, isRoomAccessDeniedError } from "../services/roomAccess.service"

type CanvasRedoPayload = {
  roomId: string
}

export async function handleCanvasRedo(
  socket: AuthenticatedSocket,
  payload: CanvasRedoPayload
) {
  if (!payload?.roomId) {
    sendSocketError(socket, "roomId is required")
    return
  }

  try {
    await assertRoomMember(socket.userId!, payload.roomId)

    await eventPublisher.publish({
      id: crypto.randomUUID(),
      type: "canvas.redo",
      roomId: payload.roomId,
      userId: socket.userId!,
      timestamp: Date.now(),
      payload: {
        timestamp: generateHLC(socket.userId!),
      },
    })
  } catch (error) {
    if (isRoomAccessDeniedError(error)) {
      sendSocketError(socket, "Not a member of this room")
      return
    }

    if (error instanceof BackpressureError) {
      sendSocketCodedError(socket, "BACKPRESSURE", "System overloaded. Try again shortly.", {
        retryAfterMs: 1000,
        strategy: "retry-with-backoff-and-local-buffer",
      })
      return
    }

    sendSocketError(socket, "Failed to queue redo")
  }
}
