import { prisma } from "@repo/db";
import { createBaseSnapshot } from "../snapshot/createBase";
import { logger } from "../infra/logger";

const SNAPSHOT_RETENTION_WINDOW = 20000n;

export async function triggerSnapshot(roomId: string, version: bigint) {
  setImmediate(async () => {
    try {
      await createBaseSnapshot(roomId, version);
      await prisma.canvasSnapshot.deleteMany({
        where: {
          roomId,
          version: {
            lt:
              version > SNAPSHOT_RETENTION_WINDOW
                ? version - SNAPSHOT_RETENTION_WINDOW
                : 0n,
          },
        },
      });
      logger.info({ roomId, version: version.toString() }, "Snapshot created");
    } catch (err) {
      logger.error(
        { err, roomId, version: version.toString() },
        "Snapshot error",
      );
    }
  });
}
