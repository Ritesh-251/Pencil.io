import { prisma, SnapshotType } from "@repo/db";
import { createBaseSnapshot } from "./createBase";
import { createDeltaSnapshot } from "./createDelta";

const BASE_INTERVAL = 2000;
const DELTA_INTERVAL = 200;
const SNAPSHOT_RETENTION_WINDOW = 20_000;

export async function createSnapshotV2(roomId: string, version: number) {
  if (version % DELTA_INTERVAL !== 0) return;

  const latest = await prisma.canvasSnapshot.findFirst({
    where: { roomId },
    orderBy: { version: "desc" },
  });

  const shouldCreateBase = !latest || version % BASE_INTERVAL === 0;

  if (shouldCreateBase) {
    await createBaseSnapshot(roomId, version);
  } else {
    await createDeltaSnapshot(roomId, latest.version, version);
  }

  await gcSnapshots(roomId);
}

async function gcSnapshots(roomId: string) {
  const latestBase = await prisma.canvasSnapshot.findFirst({
    where: { roomId, type: SnapshotType.BASE },
    orderBy: { version: "desc" },
  });

  if (!latestBase) return;

  const minKeepVersion = Math.max(
    0,
    latestBase.version - SNAPSHOT_RETENTION_WINDOW,
  );

  await prisma.canvasSnapshot.deleteMany({
    where: {
      roomId,
      version: {
        lt: minKeepVersion,
      },
    },
  });
}
