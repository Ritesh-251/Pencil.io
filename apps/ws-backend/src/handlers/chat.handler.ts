import { prisma } from "@repo/db";
import { AuthenticatedSocket } from "../types/socket";
import { roomManager } from "../manager/roomManager";
import { pubsub } from "../infra/redis";

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

  if (!roomId) {
    return sendError(socket, "roomId is required");
  }

  if (!content || typeof content !== "string") {
    return sendError(socket, "content is required");
  }
  if (content.length > 1000) {
    return sendError(socket, "message too long");
  }
  try {
    const membership = await prisma.roomMember.findUnique({
      where: {
        userId_roomId: {
          userId: socket.userId,
          roomId,
        },
      },
    });

    if (!membership) {
      return sendError(socket, "Not a member of this room");
    }

    const message = await prisma.message.create({
      data: {
        content,
        userId: socket.userId,
        roomId,
      },
    });
    const eventPayload = {
      type: "chat:new",
      payload: message,
    };

    roomManager.broadCast(roomId, eventPayload);

    try {
      await pubsub.publish({
        type: "chat:new",
        roomId,
        payload: eventPayload,
      });
    } catch (err) {
      console.error("Redis publish failed:", err);
    }
  } catch (err) {
    console.error("Chat send error:", err);
    sendError(socket, "Internal server error");
  }
};
