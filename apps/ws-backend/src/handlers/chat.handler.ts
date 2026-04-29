import { prisma } from "@repo/db";
import { AuthenticatedSocket } from "../types/socket";
import { createChatMessageEvent } from "../events/chat/chat.event";
import { BackpressureError, eventPublisher } from "../infra/eventPublisher";
import { logger } from "../infra/logger";
import { sendSocketCodedError, sendSocketError } from "../utils/socket.util";

export const handleChatSend = async function (
  socket: AuthenticatedSocket,
  payload: any,
) {
  if (!payload || typeof payload !== "object") {
    return sendSocketError(socket, "Invalid payload");
  }

  const { roomId, content } = payload;
  const userId = socket.userId!;

  if (!roomId) return sendSocketError(socket, "roomId is required");
  if (!content || typeof content !== "string")
    return sendSocketError(socket, "content is required");
  if (content.length > 10000)
    return sendSocketError(socket, "message too long");

  try {
    const membership = await prisma.roomMember.findUnique({
      where: { userId_roomId: { userId, roomId } },
    });

    if (!membership)
      return sendSocketError(socket, "Not a member of this room");

    const event = createChatMessageEvent({ roomId, userId, content });

    await eventPublisher.publish(event);
  } catch (err) {
    logger.error({ err, roomId, userId }, "Chat send error");

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
};
