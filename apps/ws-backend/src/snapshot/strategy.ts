import { prisma, SnapshotType } from "@repo/db";
import { createBaseSnapshot } from "./createBase";
import { createDeltaSnapshot } from "./createDelta";

const BASE_INTERVAL = 2000n;
const DELTA_INTERVAL = 200n;
const SNAPSHOT_RETENTION_WINDOW = 20000n;

export async function createSnapshotV2(roomId: string, version: bigint) {
  if (version % DELTA_INTERVAL !== 0n) return;

  const latest = await prisma.canvasSnapshot.findFirst({
    where: { roomId },
    orderBy: { version: "desc" },
  });

  const shouldCreateBase = !latest || version % BASE_INTERVAL === 0n;

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

  const diff = latestBase.version - SNAPSHOT_RETENTION_WINDOW;
  const minKeepVersion = diff < 0n ? 0n : diff;

  await prisma.canvasSnapshot.deleteMany({
    where: {
      roomId,
      version: {
        lt: minKeepVersion,
      },
    },
  });
}
