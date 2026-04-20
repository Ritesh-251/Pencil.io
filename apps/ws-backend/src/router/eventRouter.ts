import { AuthenticatedSocket } from "../types/socket"
import { SocketEvent } from "../types/event"

import { handleRoomJoin, handleRoomLeave } from "../handlers/room.handler"
import { handleChatSend } from "../handlers/chat.handler"
import { handleChatHistory } from "../handlers/chatHistory.handler"
import { handleStopTyping, handleTyping } from "../handlers/typing.handler"

import { handleCanvasObject } from "../handlers/canvas.handler"
import { handleCanvasReplay } from "../handlers/canvasReplay.handler"
import { handleCanvasUndo } from "../handlers/canvasUndo.handler"
import { handleCanvasRedo } from "../handlers/canvasRedo.handler"
import { handleCanvasLoad } from "../handlers/canvasLoad.handler"
import { recordError } from "../monitor/metrics"
import { logger } from "../infra/logger"
import { sendSocketError } from "../utils/socket.util"

export class EventRouter {
  async route(socket: AuthenticatedSocket, event: SocketEvent) {
    if (!event.type) {
      this.sendError(socket, "Missing event type")
      return
    }

    try {
      switch (event.type) {
       
        case "ping":
          this.handlePing(socket)
          break

        
       
        case "room:join":
          await handleRoomJoin(socket, event.payload)
          break

        case "room:leave":
          await handleRoomLeave(socket, event.payload)
          break

       
        case "chat:send":
          await handleChatSend(socket, event.payload)
          break

        case "chat:history":
          await handleChatHistory(socket, event.payload)
          break

        case "chat:typing":
          handleTyping(socket, event.payload)
          break

        case "chat:stop_typing":
          handleStopTyping(socket, event.payload)
          break

        
        case "canvas:draw":
          await handleCanvasObject(socket, event.payload)
          break

        case "canvas:undo":
          await handleCanvasUndo(socket, event.payload)
          break

        case "canvas:redo":
          await handleCanvasRedo(socket, event.payload)
          break

        case "canvas:replay":
          await handleCanvasReplay(socket, event.payload)
          break

        case "canvas:sync":
          await handleCanvasLoad(socket, {
            roomId: event.payload?.roomId,
            fromTime: event.payload?.lastKnownTimestamp,
          })
          break

        
        default:
          this.sendError(socket, `Unknown event: ${event.type}`)
      }
    } catch (error) {
      recordError()
      logger.error({ err: error }, "Router error")
      this.sendError(socket, "Internal server error")
    }
  }

  private handlePing(socket: AuthenticatedSocket) {
    socket.send(
      JSON.stringify({
        type: "pong",
        event: "pong",
        payload: {},
      }),
    )
  }

  private sendError(socket: AuthenticatedSocket, message: string) {
    sendSocketError(socket, message)
  }
}
