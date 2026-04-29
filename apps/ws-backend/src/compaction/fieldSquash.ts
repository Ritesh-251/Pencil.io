import { Prisma } from "@repo/db";
import { isRecord } from "../utils/record.util";

export type EventWithPatch = {
  id: string;
  after: Prisma.JsonValue;
};

export function readPatchProps(
  after: Prisma.JsonValue,
): Record<string, Prisma.JsonValue> {
  if (!isRecord(after)) return {};

  const props = after.props;
  if (!props || typeof props !== "object" || Array.isArray(props)) {
    return {};
  }

  return props as Record<string, Prisma.JsonValue>;
}

export function squashEvents<T extends EventWithPatch>(events: T[]): T[] {
  if (events.length <= 1) return events;

  const latestByKey = new Map<string, string>();

  for (const event of events) {
    const props = readPatchProps(event.after);
    for (const key of Object.keys(props)) {
      latestByKey.set(key, event.id);
    }
  }

  return events.filter((event) => {
    const props = readPatchProps(event.after);
    const keys = Object.keys(props);

    if (keys.length === 0) return true;

    return keys.some((key) => latestByKey.get(key) === event.id);
  });
}
