import crypto from "crypto"
import { DrawStrokeEvent } from "./canvas.types"

export function createDrawStrokeEvent({
  roomId,
  userId,
  strokeId,
  points,
  color,
  width,
}: {
  roomId: string
  userId: string
  strokeId: string
  points: { x: number; y: number }[]
  color: string
  width: number
}): DrawStrokeEvent {
  return {
    eventId: crypto.randomUUID(),
    type: "DRAW_STROKE",
    roomId,
    userId,
    timestamp: Date.now(),
    strokeId,
    points,
    color,
    width,
  }
}
