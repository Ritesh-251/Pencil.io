import { CanvasActionType, prisma } from "@repo/db";

export type TimelineItem = {
  t: number;
  type: "canvas" | "chat" | "speech";
  text: string;
};

type UnifiedCounts = {
  canvasEvents: number;
  chatMessages: number;
  transcriptSegments: number;
};

type TimelineBuildOptions = {
  includeTranscript?: boolean;
};

export async function fetchTimelineData(
  roomId: string,
  options?: TimelineBuildOptions,
): Promise<any> {
  const includeTranscript = options?.includeTranscript !== false;
  const [canvasEvents, chatMessages, transcriptSegments] = await Promise.all([
    prisma.canvasActionHistory.findMany({
      where: { roomId },
      select: {
        actionType: true,
        objectId: true,
        after: true,
        createdAt: true,
        time: true,
      },
      orderBy: [{ time: "asc" }, { createdAt: "asc" }],
    }),
    prisma.message.findMany({
      where: { roomId },
      select: {
        content: true,
        createdAt: true,
        user: {
          select: {
            email: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    includeTranscript
      ? prisma.transcriptSegment.findMany({
          where: { roomId },
          select: {
            participantIdentity: true,
            text: true,
            startMs: true,
            endMs: true,
            createdAt: true,
          },
          orderBy: [{ startMs: "asc" }, { createdAt: "asc" }],
        })
      : Promise.resolve([]),
  ]);

  return { canvasEvents, chatMessages, transcriptSegments };
}

function typeFromAction(actionType: CanvasActionType) {
  if (actionType === CanvasActionType.CREATE) return "CREATE";
  if (actionType === CanvasActionType.UPDATE) return "UPDATE";
  if (actionType === CanvasActionType.DELETE) return "DELETE";
  if (actionType === CanvasActionType.UNDO) return "UNDO";
  return "REDO";
}

function objectTypeFromAfter(after: unknown) {
  const asRecord =
    typeof after === "object" && after !== null
      ? (after as Record<string, unknown>)
      : null;
  const maybeProps =
    asRecord && typeof asRecord.props === "object" && asRecord.props !== null
      ? (asRecord.props as Record<string, unknown>)
      : null;

  const type = maybeProps?.type;
  return typeof type === "string" ? type : "object";
}

function userNameFromEmail(email: string | null) {
  if (!email) return "User";
  const [name] = email.split("@");
  return name || "User";
}

function normalizeTranscriptEpochBase(
  segments: Array<{ startMs: number; endMs: number; createdAt: Date }>,
) {
  if (segments.length === 0) return null;
  const maxStartMs = segments.reduce(
    (max, item) => Math.max(max, item.startMs),
    0,
  );
  if (maxStartMs > 1_000_000_000_000) return null;

  // Calculate potential epoch bases (wall_clock - relative_offset)
  const bases = segments
    .map((item) => item.createdAt.getTime() - item.endMs)
    .sort((a, b) => a - b);

  // Use the median value to avoid outliers from delayed processing
  const mid = Math.floor(bases.length / 2);
  const medianBase =
    bases.length % 2 !== 0 ? bases[mid]! : (bases[mid - 1]! + bases[mid]!) / 2;

  return medianBase;
}

export function buildUnifiedTimeline(
  roomId: string,
  data: Awaited<ReturnType<typeof fetchTimelineData>>,
) {
  const transcriptBaseEpoch = normalizeTranscriptEpochBase(
    data.transcriptSegments,
  );
  const timeline: TimelineItem[] = [];

  for (const item of data.canvasEvents) {
    const timestamp = item.time ? Number(item.time) : item.createdAt.getTime();
    timeline.push({
      t: timestamp,
      type: "canvas",
      text: `[canvas] ${typeFromAction(item.actionType)} ${objectTypeFromAfter(item.after)} (${item.objectId})`,
    });
  }

  for (const item of data.chatMessages) {
    timeline.push({
      t: item.createdAt.getTime(),
      type: "chat",
      text: `[chat] ${userNameFromEmail(item.user.email)}: ${item.content}`,
    });
  }

  for (const item of data.transcriptSegments) {
    const speaker = item.participantIdentity.includes(":")
      ? (item.participantIdentity.split(":")[0] ?? item.participantIdentity)
      : item.participantIdentity;
    const timestamp =
      transcriptBaseEpoch !== null
        ? transcriptBaseEpoch + item.startMs
        : item.startMs > 1_000_000_000_000
          ? item.startMs
          : item.createdAt.getTime();

    timeline.push({
      t: timestamp,
      type: "speech",
      text: `[speech] ${speaker}: ${item.text}`,
    });
  }

  timeline.sort((a, b) => a.t - b.t);

  const counts: UnifiedCounts = {
    canvasEvents: data.canvasEvents.length,
    chatMessages: data.chatMessages.length,
    transcriptSegments: data.transcriptSegments.length,
  };

  return { roomId, timeline, counts };
}

function formatWindowMs(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function chunkTimeline(timeline: TimelineItem[], windowMs = 30_000) {
  if (timeline.length === 0) return [];

  const start = timeline[0]!.t;
  const end = timeline[timeline.length - 1]!.t;
  const chunks: Array<{ startMs: number; endMs: number; content: string }> = [];

  const toRelativeInt = (value: number) => {
    const relative = Math.max(0, Math.floor(value - start));
    return Math.min(relative, 2_147_483_647);
  };

  let cursor = start;
  while (cursor <= end) {
    const windowStart = cursor;
    const windowEnd = cursor + windowMs;
    const inWindow = timeline.filter(
      (item) => item.t >= windowStart && item.t < windowEnd,
    );
    if (inWindow.length > 0) {
      const content = inWindow
        .map((item) => `[${formatWindowMs(item.t - start)}] ${item.text}`)
        .join("\n");
      chunks.push({
        startMs: toRelativeInt(windowStart),
        endMs: toRelativeInt(windowEnd),
        content,
      });
    }
    cursor = windowEnd;
  }

  return chunks;
}
