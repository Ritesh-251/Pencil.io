import { prisma } from "@repo/db";
import { materializeCRDT, mergeCRDT, type CRDTObject } from "../crdt/merge";
import { isRecord } from "../utils/record.util";

function readPatch(after: unknown): Record<string, any> | null {
  if (!isRecord(after)) return null;
  if (!isRecord(after.props)) return null;
  return after.props;
}

function materialize(crdt: CRDTObject) {
  const data = materializeCRDT(crdt);
  if (data.deleted) return null;
  return data;
}

function readSnapshotState(snapshot: any) {
  const state = new Map<string, CRDTObject>();
  if (!snapshot) return { state, valid: true };

  const objects = snapshot?.data?.objects;
  if (!Array.isArray(objects)) return { state, valid: false };

  for (const obj of objects) {
    if (!obj?.id || !obj?.crdt || !isRecord(obj.crdt)) {
      return { state: new Map<string, CRDTObject>(), valid: false };
    }

    state.set(obj.id, obj.crdt as CRDTObject);
  }

  return { state, valid: true };
}

export async function buildCanvasLoadPayload(
  roomId: string,
  fromTime?: number,
) {
  if (typeof fromTime === "number" && fromTime >= 0) {
    const events = await prisma.canvasActionHistory.findMany({
      where: {
        roomId,
        time: {
          gt: BigInt(fromTime),
        },
      },
      orderBy: [{ time: "asc" }, { actorId: "asc" }],
    });

    return {
      fromTime,
      replayedEvents: events.length,
      events,
    };
  }

  const snapshot = await prisma.canvasSnapshot.findFirst({
    where: { roomId },
    orderBy: { version: "desc" },
  });

  const parsedSnapshot = readSnapshotState(snapshot);
  // BUG-4 FIX: snapshot.version is an event-count integer (e.g. 200), but
  // CanvasActionHistory.time is a BigInt HLC timestamp in milliseconds
  // (e.g. 1_745_000_000_000).  Using version as the time filter returned the
  // entire history on every sync.  We now use snapshot.createdAt converted to
  // milliseconds, which matches the HLC epoch used by the history table.
  const snapshotCutoffMs =
    parsedSnapshot.valid && snapshot
      ? new Date(snapshot.createdAt).getTime()
      : 0;
  const baseState = parsedSnapshot.state;

  const events = await prisma.canvasActionHistory.findMany({
    where: {
      roomId,
      time: {
        gt: BigInt(snapshotCutoffMs),
      },
    },
    orderBy: [{ time: "asc" }, { actorId: "asc" }],
  });

  for (const event of events) {
    if (!event.objectId) continue;
    if (!event.time || !event.actorId) continue;

    const patch = readPatch(event.after);
    if (!patch) continue;

    const existing = baseState.get(event.objectId) || null;
    const merged = mergeCRDT(existing, {
      props: patch,
      timestamp: {
        time: Number(event.time),
        actorId: event.actorId,
      },
    });

    baseState.set(event.objectId, merged);
  }

  const updates = Array.from(baseState.entries())
    .map(([objectId, crdt]) => {
      const data = materialize(crdt);
      if (!data) return null;

      return {
        objectId,
        data,
      };
    })
    .filter(Boolean);

  return {
    snapshotCutoffMs,
    updates,
    replayedEvents: events.length,
  };
}
