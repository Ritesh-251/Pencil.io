import { AuthenticatedSocket } from "../types/socket";
import { roomManager } from "../manager/roomManager";
import { logger } from "../infra/logger";
import { sendSocketError } from "../utils/socket.util";
import {
  assertRoomMember,
  isRoomAccessDeniedError,
} from "../services/roomAccess.service";

export const handleRoomJoin = async function (
  socket: AuthenticatedSocket,
  payload: any,
) {
  if (!socket.userId) {
    sendSocketError(socket, "Unauthorized");
    return;
  }

  const { roomId } = payload;
  if (!roomId) {
    sendSocketError(socket, "roomId is required");
    return;
  }
  try {
    await assertRoomMember(socket.userId, roomId);

    const wasFirstSocket = roomManager.joinRoom(roomId, socket);
    const onlineUsers = roomManager.getOnlineUsers(roomId);

    socket.send(
      JSON.stringify({
        type: "room:joined",
        payload: {
          roomId,
          onlineUsers,
        },
      }),
    );
    if (wasFirstSocket) {
      roomManager.broadCast(roomId, {
        type: "presence:update",
        payload: {
          userId: socket.userId,
          status: "online",
          name: socket.name,
          avatarUrl: socket.avatarUrl,
        },
      });
    }
  } catch (error) {
    if (isRoomAccessDeniedError(error)) {
      sendSocketError(socket, "Not a member of this room");
      return;
    }

    logger.error(
      { err: error, userId: socket.userId, roomId },
      "Room join error",
    );
    sendSocketError(socket, "Internal server error");
  }
};
export const handleRoomLeave = async (
  socket: AuthenticatedSocket,
  payload: any,
) => {
  if (!socket.userId) {
    sendSocketError(socket, "Unauthorized");
    return;
  }

  const { roomId } = payload;
  if (!roomId) {
    sendSocketError(socket, "roomId is required");
    return;
  }
  const wasLastSocket = roomManager.leaveRoom(roomId, socket);
  socket.send(
    JSON.stringify({
      type: "room:left",
      payload: { roomId },
    }),
  );
  if (wasLastSocket) {
    roomManager.broadCast(roomId, {
      type: "presence:update",
      payload: {
        userId: socket.userId,
        status: "offline",
      },
    });
  }
};
