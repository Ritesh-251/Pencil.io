import { prisma } from "@repo/db";
import { AuthenticatedSocket } from "../types/socket";

function sendError(socket: AuthenticatedSocket, message: string) {
  socket.send(JSON.stringify({
    type: "error",
    payload: { message }
  }))
}

export async function handleCanvasLoad( socket: AuthenticatedSocket,
  payload: any){
    const {roomId} = payload;
    if(!roomId){
    return sendError(socket, "roomId is required")
    }
    try {
        const snapshot = await prisma.canvasSnapshot.findFirst({
             where: { roomId },
             orderBy: { version: "desc" },
        })
    const updates = await prisma.canvasObject.findMany({
      where: {
        roomId,
        version: {
          gt: snapshot?.version || 0,
        },
      },
      orderBy: { version: "asc" },
    })
        socket.send(JSON.stringify({
      type: "canvas:load",
      payload: {
        snapshot: snapshot?.data || { objects: [] },
        updates,
      },
    }))
    } catch (error) {
         console.error("Canvas load error:", error)

    sendError(socket, "Failed to load canvas")
        
    }

}