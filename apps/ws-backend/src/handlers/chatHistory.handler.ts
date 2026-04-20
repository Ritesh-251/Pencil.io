import { AuthenticatedSocket } from "../types/socket";
import { prisma } from "@repo/db";
import { logger } from "../infra/logger";
import { sendSocketError } from "../utils/socket.util";

export const handleChatHistory = async function (
  socket: AuthenticatedSocket,
  payload: any,
) {
  if (!payload || typeof payload !== "object") {
    return sendSocketError(socket, "Invalid payload");
  }
  const { roomId } = payload;
  if (!roomId) {
    return sendSocketError(socket, "roomId is required");
  }

  try {
    const membership = await prisma.roomMember.findUnique({
      where: {
        userId_roomId: {
          userId: socket.userId!,
          roomId,
        },
      },
    });

    if (!membership) {
      return sendSocketError(socket, "Not a member of this room");
    }
    const messages = await prisma.message.findMany({
      where: { roomId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    const orderedMessages = messages.reverse();
    socket.send(
      JSON.stringify({
        type: "chat:history",
        payload: {
          messages: orderedMessages,
        },
      }),
    );
  } catch (error) {
    logger.error({ err: error, userId: socket.userId, roomId }, "Chat history error")
    sendSocketError(socket, "Internal server error");
  }
};
