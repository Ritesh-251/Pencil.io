import { getChannel } from "../infra/rabbitmq"
import { roomManager } from "../manager/roomManager"
import { pubsub } from "../infra/redis"
import { prisma } from "@repo/db"
import { getNextVersion,triggerSnapshot } from "../utils/canvas.util"
import { handleUndo, saveHistory } from "../services/canvas.history.service"

export async function startCanvasConsumer(){
  const channel = getChannel();

  await channel.consume("canvas.queue",async (msg)=>{
    if (!msg) return;

    const event = JSON.parse(msg.content.toString())
    try {
      if(event.type = "canvas.undo"){
         const result = await handleUndo(event.roomId, event.userId);
         if (!result) {
          channel.ack(msg)
          return
        }
        const outgoing = {
          type: "canvas:undo",
          payload: {
            objectId: result.objectId,
            action: result.action,
          },
        }
         roomManager.broadCast(event.roomId, outgoing);
         await pubsub.publish({
          type: "canvas:undo",
          roomId: event.roomId,
          payload: outgoing,
        })
        channel.ack(msg)
        return

      }

      if(event.type!== "canvas.object") return;
      const { objectId, action, data } = event.payload

      const version = await getNextVersion(event.roomId)

      let beforeState: any = null;
      
      if (action === "UPDATE_OBJECT" || action === "DELETE_OBJECT") {
        const existing = await prisma.canvasObject.findUnique({
          where: { id: objectId },
        })
        beforeState = existing?.data
      }

      if (action === "CREATE_OBJECT") {
        await prisma.canvasObject.create({
          data: {
            id: objectId,
            roomId: event.roomId,
            userId: event.userId,
            type: data.type,
            data,
            version,
            createdAt: new Date(event.timestamp),
            updatedAt: new Date(event.timestamp),
          },
        })
      }

      if (action === "UPDATE_OBJECT") {
        await prisma.canvasObject.update({
          where: { id: objectId },
          data: {
            data,
            version,
            updatedAt: new Date(event.timestamp),
          },
        })
      }
      if (action === "DELETE_OBJECT") {
        await prisma.canvasObject.delete({
          where: { id: objectId },
        })
      }
      await saveHistory({
        roomId: event.roomId,
        userId: event.userId,
        action,
        objectId,
        before: beforeState,
        after: data,
        version,
      })

      if (version % 200 === 0) {
        triggerSnapshot(event.roomId, version)
      }
      const outgoing = {
        type: "canvas:object",
        payload: {
          objectId,
          action,
          data,
          userId: event.userId,
        },
      }
      roomManager.broadCast(event.roomId, outgoing)

      await pubsub.publish({
        type: "canvas:object",
        roomId: event.roomId,
        payload: outgoing,
      })

      channel.ack(msg)
    } catch (error:any) {
      if (error.code === "P2002") {
        console.log("[CanvasConsumer] Duplicate object — acking")
        channel.ack(msg)
        return
      }

      console.error("Canvas consumer error:", error)
      
    }
  })
}