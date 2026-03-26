import { prisma } from "@repo/db";
import { AuthenticatedSocket } from "../types/socket";
import { createChatMessageEvent } from "../events/chat/chat.event"
import { eventPublisher } from "../infra/eventPublisher"

function sendError(socket: AuthenticatedSocket, message: string) {
  socket.send(
    JSON.stringify({
      type: "error",
      payload: { message },
    }),
  );
}

export const handleChatSend = async function (
  socket: AuthenticatedSocket,
  payload: any,
) {
  if (!payload || typeof payload !== "object") {
    return sendError(socket, "Invalid payload");
  }

  const { roomId, content } = payload;
  const userId = socket.userId!;

  if (!roomId) return sendError(socket, "roomId is required");
  if (!content || typeof content !== "string") return sendError(socket, "content is required");
  if (content.length > 10000) return sendError(socket, "message too long");

  try {
    const membership = await prisma.roomMember.findUnique({
      where: { userId_roomId: { userId, roomId } },
    });

    if (!membership) return sendError(socket, "Not a member of this room");

    const event = createChatMessageEvent({ roomId, userId, content });

    await eventPublisher.publish(event);

  } catch (err) {
    console.error("Chat send error:", err);
    sendError(socket, "Internal server error");
  }
};