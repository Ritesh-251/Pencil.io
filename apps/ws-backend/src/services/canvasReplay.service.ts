import { prisma } from "@repo/db";
import { mergeCRDT, type CRDTObject } from "../crdt/merge";
import { isRecord } from "../utils/record.util";

export type ReplayOptions = {
  roomId: string;
  fromTime?: number;
  toTime?: number;
  toTimestamp?: number;
};

function readPatch(after: unknown): Record<string, any> | null {
  if (!isRecord(after)) return null;
  if (!isRecord(after.props)) return null;
  return after.props;
}

export async function replayCanvas({
  roomId,
  fromTime = 0,
  toTime = Number.MAX_SAFE_INTEGER,
  toTimestamp,
}: ReplayOptions): Promise<any> {
  const events = await prisma.canvasActionHistory.findMany({
    where: {
      roomId,
      time: {
        gt: BigInt(fromTime),
        lte: BigInt(toTime),
      },
      ...(typeof toTimestamp === "number"
        ? { createdAt: { lte: new Date(toTimestamp) } }
        : {}),
    },
    orderBy: [{ time: "asc" }, { actorId: "asc" }],
  });

  const state = new Map<string, CRDTObject>();

  for (const event of events) {
    if (!event.objectId) continue;
    if (!event.time || !event.actorId) continue;

    const patch = readPatch(event.after);
    if (!patch) continue;

    const existing = state.get(event.objectId) || null;

    const merged = mergeCRDT(existing, {
      props: patch,
      timestamp: {
        time: Number(event.time),
        actorId: event.actorId,
      },
    });

    state.set(event.objectId, merged);
  }

  return {
    state,
    events,
  };
}
