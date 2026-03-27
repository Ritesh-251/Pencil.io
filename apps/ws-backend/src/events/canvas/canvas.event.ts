import crypto from "crypto"
import { CanvasObjectEvent } from "./canvas.types"

export function createCanvasObjectEvent({
  roomId,
  userId,
  objectId,
  type,
  data,
}: {
  roomId: string
  userId: string
  objectId: string
  type: "CREATE_OBJECT" | "UPDATE_OBJECT" | "DELETE_OBJECT"
  data: any
}) {
  return {
    id: crypto.randomUUID(),
    type: "canvas.object",
    roomId,
    userId,
    timestamp: Date.now(),
    version: 1,
    payload: {
      objectId,
      action: type,
      data,
    },
  }
}