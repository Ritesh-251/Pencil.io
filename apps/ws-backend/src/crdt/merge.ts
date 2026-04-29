import { compareLogicalTimestamp, type LogicalTimestamp } from "./hlc";

export type CRDTMeta = {
  time: number;
  actorId: string;
};

export type CRDTObject = {
  props: Record<string, any>;
  meta: Record<string, CRDTMeta>;
};

export type CRDTIncomingPatch = {
  props: Record<string, any>;
  timestamp: LogicalTimestamp;
};

export function mergeCRDT(
  existing: CRDTObject | null,
  incoming: CRDTIncomingPatch,
): CRDTObject {
  if (!existing) {
    const meta: Record<string, CRDTMeta> = {};
    for (const key of Object.keys(incoming.props)) {
      meta[key] = {
        time: incoming.timestamp.time,
        actorId: incoming.timestamp.actorId,
      };
    }

    return {
      props: { ...incoming.props },
      meta,
    };
  }

  const result: CRDTObject = {
    props: { ...existing.props },
    meta: { ...existing.meta },
  };

  for (const key of Object.keys(incoming.props)) {
    const incomingMeta: CRDTMeta = {
      time: incoming.timestamp.time,
      actorId: incoming.timestamp.actorId,
    };

    const currentMeta = existing.meta[key];

    if (!currentMeta) {
      result.props[key] = incoming.props[key];
      result.meta[key] = incomingMeta;
      continue;
    }

    const shouldReplace =
      compareLogicalTimestamp(incomingMeta, currentMeta) > 0;

    if (shouldReplace) {
      result.props[key] = incoming.props[key];
      result.meta[key] = incomingMeta;
    }
  }

  return result;
}

export function materializeCRDT(crdt: CRDTObject | null | undefined) {
  return crdt?.props ?? {};
}
