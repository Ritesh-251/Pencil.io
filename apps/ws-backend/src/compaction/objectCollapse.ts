import { CanvasActionType, Prisma } from "@repo/db";
import { readPatchProps, type EventWithPatch } from "./fieldSquash";

export type CollapseEvent = EventWithPatch & {
  roomId: string;
  userId: string;
  objectId: string;
  before: Prisma.JsonValue;
  actionType: CanvasActionType;
  time: bigint | null;
  actorId: string | null;
  version: bigint;
  isUndone: boolean;
  createdAt: Date;
};

export type CollapsedEvent = {
  roomId: string;
  userId: string;
  objectId: string;
  before: Prisma.JsonValue;
  after: Prisma.InputJsonValue;
  actionType: CanvasActionType;
  time: bigint;
  actorId: string;
  version: bigint;
  createdAt: Date;
};

export function collapseEvents(events: CollapseEvent[]): CollapsedEvent | null {
  if (events.length === 0) return null;

  const first = events[0]!;
  const last = events[events.length - 1]!;

  if (!last.time || !last.actorId) return null;

  const mergedProps: Record<string, Prisma.JsonValue> = {};
  for (const event of events) {
    const props = readPatchProps(event.after);
    Object.assign(mergedProps, props);
  }

  return {
    roomId: last.roomId,
    userId: last.userId,
    objectId: last.objectId,
    before: first.before,
    after: { props: mergedProps } as Prisma.InputJsonValue,
    actionType: CanvasActionType.UPDATE,
    time: last.time,
    actorId: last.actorId,
    version: last.version,
    createdAt: last.createdAt,
  };
}
