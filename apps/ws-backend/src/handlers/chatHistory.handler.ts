import { AuthenticatedSocket } from "../types/socket";
import { logger } from "../infra/logger";
import { sendSocketError } from "../utils/socket.util";
import { assertRoomMember, isRoomAccessDeniedError } from "../services/roomAccess.service";
import { getRecentRoomMessages } from "../services/chatRead.service";

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
    await assertRoomMember(socket.userId!, roomId)
    const orderedMessages = await getRecentRoomMessages(roomId, 50)
    socket.send(
      JSON.stringify({
        type: "chat:history",
        payload: {
          messages: orderedMessages,
        },
      }),
    );
  } catch (error) {
    if (isRoomAccessDeniedError(error)) {
      return sendSocketError(socket, "Not a member of this room")
    }

    logger.error({ err: error, userId: socket.userId, roomId }, "Chat history error")
    sendSocketError(socket, "Internal server error");
  }
};
