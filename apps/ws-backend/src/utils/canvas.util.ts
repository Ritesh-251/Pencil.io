import { prisma, SnapshotType } from "@repo/db"
import { logger } from "../infra/logger"


export async function triggerSnapshot(roomId: string, version: number) {
  // async, non-blocking
  setImmediate(async () => {
    try {
      const objects = await prisma.canvasObject.findMany({
        where: {
          roomId,
          version: { lte: version },
        },
        select: {
          id: true,
          crdt: true,
          time: true,
          actorId: true,
        },
      })

      const normalizedObjects = objects.map((obj) => ({
        id: obj.id,
        crdt: obj.crdt,
        timestamp:
          obj.time && obj.actorId
            ? {
                time: Number(obj.time),
                actorId: obj.actorId,
              }
            : null,
      }))

      await prisma.canvasSnapshot.create({
        data: {
          roomId,
          type: SnapshotType.BASE,
          baseVersion: null,
          version,
          data: { objects: normalizedObjects },
          createdAt: new Date(),
        },
      })

      // cleanup old snapshots
      await prisma.canvasSnapshot.deleteMany({
        where: {
          roomId,
          version: { lt: version - 1000 },
        },
      })

      logger.info({ roomId, version }, "Snapshot created")
    } catch (err) {
      logger.error({ err, roomId, version }, "Snapshot error")
    }
  })
}