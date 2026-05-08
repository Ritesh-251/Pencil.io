import { AuthenticatedSocket } from "../types/socket";
import { replayCanvas } from "../services/canvasReplay.service";
import { logger } from "../infra/logger";
import { sendSocketError } from "../utils/socket.util";
import {
  assertRoomMember,
  isRoomAccessDeniedError,
} from "../services/roomAccess.service";

export async function handleCanvasReplay(
  socket: AuthenticatedSocket,
  payload: any,
) {
  if (!socket.userId) {
    sendSocketError(socket, "Unauthorized");
    return;
  }

  const { roomId, fromTime, toTime, toTimestamp } = payload || {};

  if (!roomId) {
    sendSocketError(socket, "roomId is required");
    return;
  }

  try {
    await assertRoomMember(socket.userId, roomId);

    const { state, events } = await replayCanvas({
      roomId,
      fromTime,
      toTime,
      toTimestamp,
    });

    socket.send(
      JSON.stringify({
        type: "canvas:replay",
        payload: {
          roomId,
          fromTime: fromTime ?? 0,
          toTime: toTime ?? null,
          eventCount: events.length,
          events: Array.from(state.entries()),
        },
      }),
    );
  } catch (error: any) {
    if (isRoomAccessDeniedError(error)) {
      sendSocketError(socket, "Not a member of this room");
      return;
    }

    logger.error({ err: error, roomId }, "Canvas replay error");

    sendSocketError(socket, error?.message || "Failed to replay canvas");
  }
}
