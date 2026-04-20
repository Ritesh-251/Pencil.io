// src/events/canvas.event.ts

import crypto from "crypto"
import { CanvasAction,CanvasObjectEvent } from "./canvas.types"
import { generateHLC } from "../../crdt/hlc"

export function createCanvasObjectEvent({
  roomId,
  userId,
  objectId,
  type,
  data,
  baseVersion,
}: {
  roomId: string
  userId: string
  objectId: string
  type: CanvasAction
  data: any
  baseVersion?: number
}): CanvasObjectEvent {
  return {
    id: crypto.randomUUID(),
    type: "canvas.draw",
    roomId,
    userId,
    timestamp: Date.now(),
    payload: {
      objectId,
      action: type,
      data,
      timestamp: generateHLC(userId),
      baseVersion,
    },
  }
}