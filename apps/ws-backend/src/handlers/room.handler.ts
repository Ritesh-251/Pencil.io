import { prisma } from "@repo/db";
import { AuthenticatedSocket } from "../types/socket";
import { roomManager } from "../manager/roomManager";
function sendError(socket: AuthenticatedSocket, message: string) {
  socket.send(
    JSON.stringify({
      type: "error",
      payload: { message },
    }),
  );
}

export const handleRoomJoin = async function (
  socket: AuthenticatedSocket,
  payload: any,
) {
  const { roomId } = payload;
  if (!roomId) {
    socket.send(
      JSON.stringify({
        type: "error",
        payload: { message: "roomId is required" },
      }),
    );
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
      socket.send(
        JSON.stringify({
          type: "error",
          payload: { message: "Not a member of this room" },
        }),
      );
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
    console.error("Chat history error:", error);
    sendError(socket, "Internal server error");
  }
};
export const handleRoomLeave = async (
  socket: AuthenticatedSocket,
  payload: any,
) => {
  const { roomId } = payload;
  if (!roomId) {
    socket.send(
      JSON.stringify({
        type: "error",
        payload: {
          message: "roomId is required",
        },
      }),
    );
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
