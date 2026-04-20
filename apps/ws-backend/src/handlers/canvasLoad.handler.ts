import { prisma } from "@repo/db";
import { AuthenticatedSocket } from "../types/socket";
import { materializeCRDT, mergeCRDT, type CRDTObject } from "../crdt/merge"
import { logger } from "../infra/logger";
import { sendSocketError } from "../utils/socket.util";
import { assertRoomMember, isRoomAccessDeniedError } from "../services/roomAccess.service";
import { isRecord } from "../utils/record.util";

function readPatch(after: unknown): Record<string, any> | null {
  if (!isRecord(after)) return null
  if (!isRecord(after.props)) return null
  return after.props
}

function materialize(crdt: CRDTObject) {
  const data = materializeCRDT(crdt)
  if (data.deleted) return null
  return data
}

function readSnapshotState(snapshot: any) {
  const state = new Map<string, CRDTObject>()
  if (!snapshot) return { state, valid: true }

  const objects = snapshot?.data?.objects
  if (!Array.isArray(objects)) return { state, valid: false }

  for (const obj of objects) {
    if (!obj?.id || !obj?.crdt || !isRecord(obj.crdt)) {
      return { state: new Map<string, CRDTObject>(), valid: false }
    }

    state.set(obj.id, obj.crdt as CRDTObject)
  }

  return { state, valid: true }
}

export async function handleCanvasLoad( socket: AuthenticatedSocket,
  payload: any){
    const { roomId, fromTime } = payload;
    if(!roomId){
    return sendSocketError(socket, "roomId is required")
    }
    try {
      await assertRoomMember(socket.userId!, roomId)

      if (typeof fromTime === "number" && fromTime >= 0) {
        const events = await prisma.canvasActionHistory.findMany({
          where: {
            roomId,
            time: {
              gt: BigInt(fromTime),
            },
          },
          orderBy: [{ time: "asc" }, { actorId: "asc" }],
        })

        socket.send(JSON.stringify({
          type: "canvas:load",
          payload: {
            fromTime,
            replayedEvents: events.length,
            events,
          },
        }))

        return
      }

      const snapshot = await prisma.canvasSnapshot.findFirst({
        where: { roomId },
        orderBy: { version: "desc" },
      })

      const parsedSnapshot = readSnapshotState(snapshot)
      const snapshotTime = parsedSnapshot.valid ? Number(snapshot?.version ?? 0) : 0
      const baseState = parsedSnapshot.state

      const events = await prisma.canvasActionHistory.findMany({
      where: {
        roomId,
        time: {
          gt: BigInt(snapshotTime),
        },
      },
      orderBy: [{ time: "asc" }, { actorId: "asc" }],
    })

      for (const event of events) {

        if (!event.objectId) continue
        if (!event.time || !event.actorId) continue

        const patch = readPatch(event.after)
        if (!patch) continue

        const existing = baseState.get(event.objectId) || null
        const merged = mergeCRDT(existing, {
          props: patch,
          timestamp: {
            time: Number(event.time),
            actorId: event.actorId,
          },
        })

        baseState.set(event.objectId, merged)
      }

      const updates = Array.from(baseState.entries())
        .map(([objectId, crdt]) => {
          const data = materialize(crdt)
          if (!data) return null

          return {
            objectId,
            data,
          }
        })
        .filter(Boolean)

      socket.send(JSON.stringify({
      type: "canvas:load",
      payload: {
        snapshotTime,
        updates,
        replayedEvents: events.length,
      },
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
