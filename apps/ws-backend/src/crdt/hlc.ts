export type LogicalTimestamp = {
  time: number
  actorId: string
}

const lastTimeMap = new Map<string, number>()

export function generateHLC(actorId: string): LogicalTimestamp {
  const now = Date.now()
  const lastTime = lastTimeMap.get(actorId) ?? 0
  const nextTime = Math.max(lastTime + 1, now)
  lastTimeMap.set(actorId, nextTime)

  return {
    time: nextTime,
    actorId,
  }
}

export function compareLogicalTimestamp(
  a: LogicalTimestamp,
  b: LogicalTimestamp,
) {
  if (a.time !== b.time) return a.time - b.time
  return a.actorId.localeCompare(b.actorId)
}

export function normalizeLogicalTimestamp(
  value: unknown,
  fallbackActorId: string,
): LogicalTimestamp {
  if (
    value &&
    typeof value === "object" &&
    typeof (value as { time?: unknown }).time === "number" &&
    typeof (value as { actorId?: unknown }).actorId === "string"
  ) {
    const ts = value as LogicalTimestamp
    return {
      time: ts.time,
      actorId: ts.actorId,
    }
  }

  return generateHLC(fallbackActorId)
}
