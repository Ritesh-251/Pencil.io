import { prisma } from "@repo/db";
import { AuthenticatedSocket } from "../types/socket";
import { roomManager } from "../manager/roomManager";
import { logger } from "../infra/logger";
import { sendSocketError } from "../utils/socket.util";

export const handleRoomJoin = async function (
  socket: AuthenticatedSocket,
  payload: any,
) {
  const { roomId } = payload;
  if (!roomId) {
    sendSocketError(socket, "roomId is required")
    return;
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
      sendSocketError(socket, "Not a member of this room")
      return;
    }
    roomManager.joinRoom(roomId, socket);
    socket.send(
      JSON.stringify({
        type: "room:joined",
        payload: { roomId },
      }),
    );
    roomManager.broadCast(roomId, {
      type: "presence:update",
      payload: {
        userId: socket.userId,
        status: "online",
      },
    });
  } catch (error) {
    logger.error({ err: error, userId: socket.userId, roomId }, "Room join error")
    sendSocketError(socket, "Internal server error");
  }
};
export const handleRoomLeave = async (
  socket: AuthenticatedSocket,
  payload: any,
) => {
  const { roomId } = payload;
  if (!roomId) {
    sendSocketError(socket, "roomId is required")
    return;
  }
  roomManager.leaveRoom(roomId, socket);
  socket.send(
    JSON.stringify({
      type: "room:left",
      payload: { roomId },
    }),
  );
  roomManager.broadCast(roomId, {
    type: "presence:update",
    payload: {
      userId: socket.userId,
      status: "offline",
    },
  });
};
