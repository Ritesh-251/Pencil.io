import pino from "pino"

type PipelineStage = "publish" | "consume" | "broadcast"

export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  base: null,
  timestamp: pino.stdTimeFunctions.isoTime,
})

export function logEvent(
  stage: PipelineStage,
  event: {
    id?: string
    roomId?: string
    userId?: string
    type?: string
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
  })
}
