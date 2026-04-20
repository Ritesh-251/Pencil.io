import { prisma, SnapshotType } from "@repo/db"
import { compressSnapshotData } from "./compress"
import { isRecord } from "../utils/record.util"

type JsonRecord = Record<string, any>

function readPatchProps(after: unknown): JsonRecord {
  if (!isRecord(after)) return {}
  if (!isRecord(after.props)) return {}
  return after.props
}

export async function createDeltaSnapshot(
  roomId: string,
  fromVersion: number,
  toVersion: number,
) {
  if (toVersion <= fromVersion) return

  const events = await prisma.canvasActionHistory.findMany({
    where: {
      roomId,
      version: {
        gt: fromVersion,
        lte: toVersion,
      },
    },
    orderBy: [{ time: "asc" }, { actorId: "asc" }],
  })

  const changes = events.map((event) => ({
    objectId: event.objectId,
    patch: readPatchProps(event.after),
    version: event.version,
    actorId: event.actorId ?? event.userId,
    time: event.time ? Number(event.time) : event.version,
  }))

  await prisma.canvasSnapshot.create({
    data: {
      roomId,
      type: SnapshotType.DELTA,
      baseVersion: fromVersion,
      version: toVersion,
      data: compressSnapshotData({ changes }),
      createdAt: new Date(),
    },
  })
}
