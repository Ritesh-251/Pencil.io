import { CanvasActionType, prisma, Prisma } from "@repo/db"
import crypto from "crypto"
import { squashEvents } from "./fieldSquash"
import { collapseEvents, type CollapseEvent } from "./objectCollapse"
import { acquireDistributedLock, releaseDistributedLock } from "../infra/redis"
import { isRecord } from "../utils/record.util"

type CompactOptions = {
  minEvents?: number
}

async function acquireRoomLock(roomId: string, ttlMs: number) {
  const token = crypto.randomUUID()
  const key = `lock:compaction:${roomId}`
  const acquired = await acquireDistributedLock(key, token, ttlMs)
  if (!acquired) return null
  return { key, token }
}

function hasDeleteBoundary(after: Prisma.JsonValue) {
  if (!isRecord(after)) return false

  const props = after.props
  if (!props || typeof props !== "object" || Array.isArray(props)) return false

  return Object.prototype.hasOwnProperty.call(props, "deleted")
}

function toInputJson(value: Prisma.JsonValue): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue)
}

function isBoundaryEvent(event: {
  actionType: CanvasActionType
  referenceActionId?: string | null
  after: Prisma.JsonValue
}) {
  if (event.actionType === CanvasActionType.UNDO || event.actionType === CanvasActionType.REDO) {
    return true
  }

  if (event.referenceActionId) return true

  return hasDeleteBoundary(event.after)
}

function splitByBoundaries(events: CollapseEvent[]) {
  const segments: CollapseEvent[][] = []
  let current: CollapseEvent[] = []

  for (const event of events) {
    if (isBoundaryEvent(event)) {
      if (current.length > 0) {
        segments.push(current)
        current = []
      }
      segments.push([event])
      continue
    }

    current.push(event)
  }

  if (current.length > 0) segments.push(current)

  return segments
}

export async function compactRoom(roomId: string, options: CompactOptions = {}) {
  const minEvents = options.minEvents ?? 10_000

  const roomLock = await acquireRoomLock(roomId, 60_000)
  if (!roomLock) {
    return { roomId, compacted: 0, skipped: "locked" as const }
  }

  try {
    const snapshot = await prisma.canvasSnapshot.findFirst({
      where: { roomId },
      orderBy: { version: "desc" },
    })

    if (!snapshot) {
      return { roomId, compacted: 0, skipped: "no-snapshot" as const }
    }

    const cutoffTime = BigInt(new Date(snapshot.createdAt).getTime())

    const events = await prisma.canvasActionHistory.findMany({
      where: {
        roomId,
        time: {
          lte: cutoffTime,
        },
      },
      orderBy: [{ time: "asc" }, { actorId: "asc" }],
    })

    if (events.length < minEvents) {
      return { roomId, compacted: 0, skipped: "below-threshold" as const }
    }

    const byObject = new Map<string, CollapseEvent[]>()
    for (const event of events) {
      const group = byObject.get(event.objectId) || []
      group.push(event)
      byObject.set(event.objectId, group)
    }

    const deleteIds = new Set<string>()
    const createData: Prisma.CanvasActionHistoryCreateManyInput[] = []

    for (const [, objectEvents] of byObject) {
      const segments = splitByBoundaries(objectEvents)

      for (const segment of segments) {
        if (segment.length <= 1) continue

        const squashed = squashEvents(segment)
        if (squashed.length <= 1) continue

        const collapsed = collapseEvents(squashed)
        if (!collapsed) continue

        for (const oldEvent of segment) {
          deleteIds.add(oldEvent.id)
        }

        createData.push({
          roomId: collapsed.roomId,
          userId: collapsed.userId,
          actionType: collapsed.actionType,
          objectId: collapsed.objectId,
          before: toInputJson(collapsed.before),
          after: collapsed.after,
          time: collapsed.time,
          actorId: collapsed.actorId,
          version: collapsed.version,
          isUndone: false,
          isRedoInvalidated: false,
          undoneAtVersion: null,
          referenceActionId: null,
          eventId: `compact-${crypto.randomUUID()}`,
          createdAt: collapsed.createdAt,
        })
      }
    }

    if (deleteIds.size === 0 || createData.length === 0) {
      return { roomId, compacted: 0, skipped: "nothing-to-compact" as const }
    }

    await prisma.$transaction(async (tx) => {
      await tx.canvasActionHistory.deleteMany({
        where: {
          id: { in: Array.from(deleteIds) },
        },
      })

      await tx.canvasActionHistory.createMany({
        data: createData,
      })
    })

    return { roomId, compacted: deleteIds.size - createData.length, skipped: null }
  } finally {
    await releaseDistributedLock(roomLock.key, roomLock.token)
  }
}

export async function compactAllRooms(options: CompactOptions = {}) {
  const batchSize = 500
  let lastRoomId: string | null = null
  const rooms: Array<{ roomId: string }> = []

  while (true) {
    const page: Array<{ id: string }> = await prisma.room.findMany({
      select: { id: true },
      where: lastRoomId
        ? {
            id: { gt: lastRoomId },
          }
        : undefined,
      orderBy: { id: "asc" },
      take: batchSize,
    })

    if (page.length === 0) break

    for (const room of page) {
      rooms.push({ roomId: room.id })
    }

    lastRoomId = page[page.length - 1]?.id ?? null
  }

  const results = []
  for (const room of rooms) {
    const result = await compactRoom(room.roomId, options)
    results.push(result)
  }

  return results
}
