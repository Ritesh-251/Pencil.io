import { AuthenticatedSocket } from "../types/socket";
import { logger } from "../infra/logger";
import { sendSocketError } from "../utils/socket.util";
import { assertRoomMember, isRoomAccessDeniedError } from "../services/roomAccess.service";
import { buildCanvasLoadPayload } from "../services/canvasRead.service";

export async function handleCanvasLoad( socket: AuthenticatedSocket,
  payload: any){
    const { roomId, fromTime } = payload;
    if(!roomId){
    return sendSocketError(socket, "roomId is required")
    }
    try {
      await assertRoomMember(socket.userId!, roomId)
      const canvasPayload = await buildCanvasLoadPayload(roomId, fromTime)

      socket.send(JSON.stringify({
      type: "canvas:load",
      payload: canvasPayload,
    }))
    } catch (error) {
        if (isRoomAccessDeniedError(error)) {
          sendSocketError(socket, "Not a member of this room")
          return
        }

        logger.error({ err: error, roomId }, "Canvas load error")

    sendSocketError(socket, "Failed to load canvas")
        
    }

}
