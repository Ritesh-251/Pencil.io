export type LogicalTimestamp = {
  time: number;
  actorId: string;
};

// Q-3: lastTimeMap is intentionally process-local and not persisted to Redis.
// HLC correctness only requires monotonicity per actor *per process*.  When a
// user reconnects to a different pod the HLC resets to Date.now(), which is
// safe because the wall clock always advances and any conflict is resolved by
// the actorId tiebreaker in compareLogicalTimestamp.  If sub-millisecond
// ordering across pod restarts is ever required, store the actor’s lastTime in
// Redis (a single GET/SET per connection).
const lastTimeMap = new Map<string, number>();
const MAX_CLOCK_DRIFT_MS = 5 * 60 * 1000;

function clampLogicalTime(time: number) {
  const now = Date.now();
  const maxAllowed = now + MAX_CLOCK_DRIFT_MS;
  if (time > maxAllowed) return maxAllowed;
  return time;
}

export function generateHLC(actorId: string): LogicalTimestamp {
  const now = Date.now();
  const lastTime = lastTimeMap.get(actorId) ?? 0;
  const nextTime = clampLogicalTime(Math.max(lastTime + 1, now));
  lastTimeMap.set(actorId, nextTime);

  return {
    time: nextTime,
    actorId,
  };
}

export function compareLogicalTimestamp(
  a: LogicalTimestamp,
  b: LogicalTimestamp,
) {
  if (a.time !== b.time) return a.time - b.time;
  return a.actorId.localeCompare(b.actorId);
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
    const ts = value as LogicalTimestamp;
    return {
      time: clampLogicalTime(ts.time),
      actorId: ts.actorId,
    };
  }

  return generateHLC(fallbackActorId);
}
