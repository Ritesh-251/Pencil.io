import { prisma, SnapshotType } from "@repo/db";
import { compressSnapshotData } from "./compress";

export async function createBaseSnapshot(roomId: string, version: bigint) {
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
  });

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
  }));

  await prisma.canvasSnapshot.create({
    data: {
      roomId,
      type: SnapshotType.BASE,
      baseVersion: null,
      version,
      data: compressSnapshotData({ objects: normalizedObjects }),
      createdAt: new Date(),
    },
  });
}
