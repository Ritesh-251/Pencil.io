import crypto from "crypto"
import { Event } from "../../types/event"

type ChatPayload = {
  messageId: string
  content: string
}

export function createChatMessageEvent({
  roomId,
  userId,
  content,
}: {
  roomId: string
  userId: string
  content: string
}): Event<ChatPayload> {
  return {
    id: crypto.randomUUID(),
    type: "chat.message",
    roomId,
    userId,
    timestamp: Date.now(),
    version: 1,
    payload: {
      messageId: crypto.randomUUID(),
      content,
    },
  }
}
