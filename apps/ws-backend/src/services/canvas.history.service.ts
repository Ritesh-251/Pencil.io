import { Prisma as prisma, CanvasActionType } from "@repo/db";
import { mergeCRDT, type CRDTObject } from "../crdt/merge";
import crypto from "crypto";
import { LogicalTimestamp } from "../crdt/hlc";
import { isRecord } from "../utils/record.util";

function toPrismaJson(
  value: prisma.JsonValue | null,
): prisma.InputJsonValue | typeof prisma.JsonNull {
  return value === null ? prisma.JsonNull : (value as prisma.InputJsonValue);
}

export async function saveHistory(
  tx: prisma.TransactionClient,
  data: {
    roomId: string;
    userId: string;
    actionType: CanvasActionType;
    objectId: string;
    before: prisma.JsonValue;
    after: prisma.JsonValue;
    version: bigint;
    eventId: string;
    timestamp?: number;
    time: number;
    actorId: string;
  },
) {
  const afterPatch = toJsonRecord(data.after);
  if (!afterPatch || !isRecord(afterPatch.props)) {
    throw new Error("CanvasActionHistory.after must be a patch with props");
  }

  await tx.canvasActionHistory.create({
    data: {
      roomId: data.roomId,
      userId: data.userId,
      actionType: data.actionType,
      objectId: data.objectId,

      before: toPrismaJson(data.before),
      after: toPrismaJson(data.after),

      version: data.version,
      time: BigInt(data.time),
      actorId: data.actorId,
      eventId: data.eventId,
      createdAt: data.timestamp ? new Date(data.timestamp) : new Date(),

      isUndone: false,
      undoneAtVersion: null,
      referenceActionId: null,
    },
  });
}

function toJsonRecord(value: unknown): Record<string, any> | null {
  if (!isRecord(value)) return null;
  return value as Record<string, any>;
}

function parseCRDTObject(value: unknown): CRDTObject | null {
  const root = toJsonRecord(value);
  if (!root) return null;

  const props = toJsonRecord(root.props);
  const meta = toJsonRecord(root.meta);
  if (!props || !meta) return null;

  const normalizedMeta: CRDTObject["meta"] = {};
  for (const key of Object.keys(meta)) {
    const entry = toJsonRecord(meta[key]);
    if (!entry) continue;

    const time = entry.time;
    const actorId = entry.actorId;
    if (typeof time !== "number" || typeof actorId !== "string") continue;

    normalizedMeta[key] = { time, actorId };
  }

  return {
    props,
    meta: normalizedMeta,
  };
}

function parsePatch(value: unknown): Record<string, any> | null {
  const root = toJsonRecord(value);
  if (!root) return null;

  const props = toJsonRecord(root.props);
  return props;
}

function resolveType(
  currentType: string | null | undefined,
  props: Record<string, any>,
) {
  if (currentType) return currentType;
  if (typeof props.type === "string") return props.type;
  return "shape";
}

async function applyPatch(
  tx: prisma.TransactionClient,
  args: {
    roomId: string;
    userId: string;
    objectId: string;
    version: bigint;
    logicalTimestamp: LogicalTimestamp;
    props: Record<string, any>;
  },
) {
  const now = new Date();
  const current = await tx.canvasObject.findUnique({
    where: { id: args.objectId },
  });

  const merged = mergeCRDT(parseCRDTObject(current?.crdt), {
    props: args.props,
    timestamp: args.logicalTimestamp,
  });

  await tx.canvasObject.upsert({
    where: { id: args.objectId },
    create: {
      id: args.objectId,
      roomId: args.roomId,
      userId: args.userId,
      type: resolveType(current?.type, merged.props),
      data: toPrismaJson(merged.props),
      crdt: toPrismaJson(merged),
      time: BigInt(args.logicalTimestamp.time),
      actorId: args.logicalTimestamp.actorId,
      version: args.version,
      createdAt: now,
      updatedAt: now,
    },
    update: {
      data: toPrismaJson(merged.props),
      crdt: toPrismaJson(merged),
      time: BigInt(args.logicalTimestamp.time),
      actorId: args.logicalTimestamp.actorId,
      version: args.version,
      updatedAt: now,
    },
  });
}

async function applyInverse(
  tx: prisma.TransactionClient,
  action: any,
  version: bigint,
  logicalTimestamp: LogicalTimestamp,
) {
  if (!action.objectId) return;

  const before = parseCRDTObject(action.before);
  const inverseProps = before?.props ?? { deleted: true };

  await applyPatch(tx, {
    roomId: action.roomId,
    userId: logicalTimestamp.actorId,
    objectId: action.objectId,
    version,
    logicalTimestamp,
    props: inverseProps,
  });

  return inverseProps;
}

async function applyForward(
  tx: prisma.TransactionClient,
  action: any,
  version: bigint,
  logicalTimestamp: LogicalTimestamp,
) {
  if (!action.objectId) return;

  const patchProps = parsePatch(action.after);
  if (!patchProps) return null;

  await applyPatch(tx, {
    roomId: action.roomId,
    userId: logicalTimestamp.actorId,
    objectId: action.objectId,
    version,
    logicalTimestamp,
    props: patchProps,
  });

  return patchProps;
}

export async function handleUndo(
  tx: prisma.TransactionClient,
  roomId: string,
  userId: string,
  version: bigint,
  logicalTimestamp: LogicalTimestamp,
) {
  // 1. find last NOT undone action
  const last = await tx.canvasActionHistory.findFirst({
    where: {
      roomId,
      userId,
      isUndone: false,
      actionType: {
        in: [
          CanvasActionType.CREATE,
          CanvasActionType.UPDATE,
          CanvasActionType.DELETE,
        ],
      },
    },
    orderBy: [{ time: "desc" }, { actorId: "desc" }],
  });

  if (!last) return null;

  const result = await tx.canvasActionHistory.updateMany({
    where: {
      id: last.id,
      isUndone: false,
    },
    data: {
      isUndone: true,
      isRedoInvalidated: false,
      undoneAtVersion: version,
    },
  });

  if (result.count === 0) {
    // someone else already undid it
    return null;
  }

  const currentBeforeUndo = await tx.canvasObject.findUnique({
    where: { id: last.objectId },
    select: { crdt: true },
  });

  // 3. apply inverse
  const inverseProps = await applyInverse(tx, last, version, logicalTimestamp);

  // 4. write UNDO history
  await tx.canvasActionHistory.create({
    data: {
      roomId,
      userId,
      actionType: CanvasActionType.UNDO,
      objectId: last.objectId,
      before: toPrismaJson((currentBeforeUndo?.crdt as prisma.JsonValue) ?? {}),
      after: toPrismaJson({ props: inverseProps ?? {} }),
      time: BigInt(logicalTimestamp.time),
      actorId: logicalTimestamp.actorId,
      referenceActionId: last.id,
      eventId: `undo-${crypto.randomUUID()}`,
      version,
      createdAt: new Date(),
      isUndone: false,
      isRedoInvalidated: false,
      undoneAtVersion: null,
    },
  });

  return { ...last, resolvedProps: inverseProps };
}

/**
 * HANDLE REDO (PRODUCTION SAFE)
 */
export async function handleRedo(
  tx: prisma.TransactionClient,
  roomId: string,
  userId: string,
  version: bigint,
  logicalTimestamp: LogicalTimestamp,
) {
  // 1. find last undone action
  const action = await tx.canvasActionHistory.findFirst({
    where: {
      roomId,
      userId,
      isUndone: true,
      isRedoInvalidated: false,
      actionType: {
        in: [
          CanvasActionType.CREATE,
          CanvasActionType.UPDATE,
          CanvasActionType.DELETE,
        ],
      },
    },
    orderBy: [{ time: "desc" }, { actorId: "desc" }],
  });

  if (!action) return null;

  // 2. validate redo chain: reject redo when user performed newer actions after the undo marker
  const undoMarker = await tx.canvasActionHistory.findFirst({
    where: {
      roomId,
      userId,
      actionType: CanvasActionType.UNDO,
      referenceActionId: action.id,
    },
    orderBy: [{ time: "desc" }, { actorId: "desc" }],
  });

  const undoneAtTime = undoMarker?.time ?? action.time;
  if (undoneAtTime) {
    const newerAction = await tx.canvasActionHistory.findFirst({
      where: {
        roomId,
        userId,
        time: { gt: undoneAtTime },
        id: { not: undoMarker?.id },
      },
      orderBy: [{ time: "desc" }, { actorId: "desc" }],
    });

    if (newerAction) {
      return null;
    }
  }

  const result = await tx.canvasActionHistory.updateMany({
    where: {
      id: action.id,
      isUndone: true,
    },
    data: {
      isUndone: false,
      isRedoInvalidated: false,
      undoneAtVersion: null,
    },
  });

  if (result.count === 0) return null;

  const currentBeforeRedo = await tx.canvasObject.findUnique({
    where: { id: action.objectId },
    select: { crdt: true },
  });

  // 4. reapply forward
  const redoProps = await applyForward(tx, action, version, logicalTimestamp);
  if (!redoProps) return null;

  // 5. write REDO history
  await tx.canvasActionHistory.create({
    data: {
      roomId,
      userId,
      actionType: CanvasActionType.REDO,
      objectId: action.objectId,
      before: toPrismaJson((currentBeforeRedo?.crdt as prisma.JsonValue) ?? {}),
      after: toPrismaJson({ props: redoProps }),
      time: BigInt(logicalTimestamp.time),
      actorId: logicalTimestamp.actorId,
      referenceActionId: action.id,
      eventId: `redo-${crypto.randomUUID()}`,
      version,
      createdAt: new Date(),
      isUndone: false,
      isRedoInvalidated: false,
      undoneAtVersion: null,
    },
  });

  return { ...action, resolvedProps: redoProps };
}
