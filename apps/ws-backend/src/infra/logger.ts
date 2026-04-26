import { createLogger } from "@repo/common";

export const logger = createLogger("ws-backend");

type PipelineStage = "publish" | "consume" | "broadcast";

export function logEvent(
  stage: PipelineStage,
  event: {
    id?: string;
    roomId?: string;
    userId?: string;
    type?: string;
  },
  extra?: Record<string, unknown>,
) {
  logger.info({
    stage,
    eventId: event.id || null,
    roomId: event.roomId || null,
    userId: event.userId || null,
    type: event.type || null,
    ...extra,
  });
}
