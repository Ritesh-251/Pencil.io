import { ConsumeMessage } from "amqplib";
import { getChannel } from "../infra/rabbitmq"
import { roomManager } from "../manager/roomManager"
import { safePublish } from "../infra/redis"
import { CanvasActionType, prisma } from "@repo/db"
import { triggerSnapshot } from "../utils/canvas.util"
import { handleUndo, handleRedo, saveHistory } from "../services/canvas.history.service"
import { mergeCRDT } from "../crdt/merge"
import { normalizeLogicalTimestamp } from "../crdt/hlc"
import { logEvent, logger } from "../infra/logger"
import { recordCanvasConsumerLagMs, recordError, recordErrorDetail, recordProcessingLatencyMs } from "../monitor/metrics"

const roomEventCountSinceSnapshot = new Map<string, number>()
const SNAPSHOT_EVERY_EVENTS = Number(process.env.SNAPSHOT_EVERY_EVENTS || 200)
const MAX_DB_INT = 2_147_483_647

function toDbVersion(logicalTimeMs: number) {
  // Prisma schema stores version as Int; logical clock is in ms and exceeds int32.
  // Persist epoch seconds to keep ordering while staying inside integer limits.
  const seconds = Math.floor(logicalTimeMs / 1000)
  if (seconds > MAX_DB_INT) return MAX_DB_INT
  if (seconds < 0) return 0
  return seconds
}

function mapCanvasActionToHistoryAction(action: string): CanvasActionType {
  if (action === "CREATE_OBJECT") return CanvasActionType.CREATE
  if (action === "UPDATE_OBJECT") return CanvasActionType.UPDATE
  if (action === "DELETE_OBJECT") return CanvasActionType.DELETE
  throw new Error(`Unsupported canvas action: ${action}`)
}

function mapHistoryActionToCanvasAction(actionType: CanvasActionType): string {
  if (actionType === CanvasActionType.CREATE) return "CREATE_OBJECT"
  if (actionType === CanvasActionType.UPDATE) return "UPDATE_OBJECT"
  if (actionType === CanvasActionType.DELETE) return "DELETE_OBJECT"
  return String(actionType)
}

export async function startCanvasConsumer() {
  const channel = getChannel()

  await channel.consume("canvas.queue", async (msg: ConsumeMessage | null) => {
    if (!msg) return

    const startedAt = Date.now()
    const event = JSON.parse(msg.content.toString())
    recordCanvasConsumerLagMs(Date.now() - Number(event.timestamp || Date.now()))

    const eventTime = Number(event?.payload?.timestamp?.time || event.timestamp || Date.now())
    recordProcessingLatencyMs(Date.now() - eventTime)

    try {
      const result = await prisma.$transaction(async (tx) => {

        // 🔥 1. EVENT DEDUP (CRITICAL)
        try {
          await tx.processedEvent.create({
            data: {
              eventId: event.id,
            },
          })
        } catch (err: any) {
          if (err.code === "P2002") {
            logger.info({ eventId: event.id, stage: "consume" }, "Canvas dedup: event already processed")
            return null // skip entire processing
          }
          throw err
        }

        const logicalTimestamp = normalizeLogicalTimestamp(
          event?.payload?.timestamp,
          event.userId,
        )
        const version = toDbVersion(logicalTimestamp.time)

        // ======================
        // 🔁 UNDO
        // ======================
        if (event.type === "canvas.undo") {
          const undone = await handleUndo(
            tx,
            event.roomId,
            event.userId,
            version,
            logicalTimestamp,
          )

          return {
            type: "undo",
            version,
            result: undone,
          }
        }

        // ======================
        // 🔁 REDO
        // ======================
        if (event.type === "canvas.redo") {
          const redone = await handleRedo(
            tx,
            event.roomId,
            event.userId,
            version,
            logicalTimestamp,
          )

          return {
            type: "redo",
            version,
            result: redone,
          }
        }

        // ======================
        // 🎨 NORMAL OBJECT EVENT
        // ======================
        if (event.type !== "canvas.draw") return null

        const { objectId, action, data } = event.payload
        const existing = await tx.canvasObject.findUnique({
          where: { id: objectId },
        })

        let beforeState: any = existing?.crdt || null

        // Always merge — CRDT resolves conflicts.

        const incoming = {
          props: action === "DELETE_OBJECT" ? { deleted: true } : (data || {}),
          timestamp: logicalTimestamp,
        }

        const merged = mergeCRDT(
          (existing?.crdt as any) ?? null,
          incoming,
        )

        const objectType =
          existing?.type ||
          (typeof data?.type === "string" ? data.type : "shape")


        // 🔥 3. REDO INVALIDATION
        await tx.canvasActionHistory.updateMany({
          where: {
            roomId: event.roomId,
            userId: event.userId,
            isUndone: true,
            isRedoInvalidated: false,
          },
          data: {
            isRedoInvalidated: true,
          },
        })

        // ---- APPLY ACTION ----

        await tx.canvasObject.upsert({
          where: { id: objectId },
          create: {
            id: objectId,
            roomId: event.roomId,
            userId: event.userId,
            type: objectType,
            data: merged.props,
            crdt: merged,
            time: BigInt(logicalTimestamp.time),
            actorId: logicalTimestamp.actorId,
            version,
            createdAt: new Date(event.timestamp),
            updatedAt: new Date(event.timestamp),
          },
          update: {
            data: merged.props,
            crdt: merged,
            time: BigInt(logicalTimestamp.time),
            actorId: logicalTimestamp.actorId,
            version,
            updatedAt: new Date(event.timestamp),
          },
        })

        // ---- SAVE HISTORY ----
        await saveHistory(tx, {
          roomId: event.roomId,
          userId: event.userId,
          actionType: mapCanvasActionToHistoryAction(action),
          objectId,
          before: beforeState,
          after: incoming,
          version,
          eventId: event.id,
          timestamp: event.timestamp,
          time: logicalTimestamp.time,
          actorId: logicalTimestamp.actorId,
        })

        return {
          type: "object",
          version,
          objectId,
          action,
          data,
        }
      })
      // ======================
      // 🚫 NOTHING TO DO (DEDUP OR INVALID)
      // ======================
      if (!result) {
        channel.ack(msg)
        return
      }

      // ======================
      // 🔁 UNDO BROADCAST
      // ======================
      if (result.type === "undo") {
        if (!result.result) {
          channel.ack(msg)
          return
        }

        const outgoing = {
          type: "canvas:undo",
          payload: {
            objectId: result.result.objectId,
            action: mapHistoryActionToCanvasAction(result.result.actionType),
          },
        }

        roomManager.broadCast(event.roomId, outgoing)

        await safePublish({
          type: "canvas:undo",
          roomId: event.roomId,
          payload: outgoing,
        })

        logEvent("broadcast", event, { subtype: "undo", durationMs: Date.now() - startedAt })

        channel.ack(msg)
        return
      }

      // ======================
      // 🔁 REDO BROADCAST
      // ======================
      if (result.type === "redo") {
        if (!result.result) {
          channel.ack(msg)
          return
        }

        const outgoing = {
          type: "canvas:redo",
          payload: {
            objectId: result.result.objectId,
            action: mapHistoryActionToCanvasAction(result.result.actionType),
          },
        }

        roomManager.broadCast(event.roomId, outgoing)

        await safePublish({
          type: "canvas:redo",
          roomId: event.roomId,
          payload: outgoing,
        })

        logEvent("broadcast", event, { subtype: "redo", durationMs: Date.now() - startedAt })

        channel.ack(msg)
        return
      }

      // ======================
      // 🎨 OBJECT BROADCAST
      // ======================
      if (result.type === "object") {
        const currentCount = (roomEventCountSinceSnapshot.get(event.roomId) || 0) + 1
        roomEventCountSinceSnapshot.set(event.roomId, currentCount)

        if (currentCount >= SNAPSHOT_EVERY_EVENTS) {
          triggerSnapshot(event.roomId, result.version)
          roomEventCountSinceSnapshot.set(event.roomId, 0)
        }

        logEvent("consume", event, { subtype: "object", durationMs: Date.now() - startedAt })

        const outgoing = {
          type: "canvas:object",
          payload: {
            objectId: result.objectId,
            action: result.action,
            data: result.data,
            userId: event.userId,
          },
        }

        roomManager.broadCast(event.roomId, outgoing)

        await safePublish({
          type: "canvas:object",
          roomId: event.roomId,
          payload: outgoing,
        })

        logEvent("broadcast", event, { subtype: "object", durationMs: Date.now() - startedAt })

        channel.ack(msg)
        return
      }

    } catch (error: any) {
      if (error.code === "P2002") {
        logger.info({
          stage: "consume",
          eventId: event.id,
          roomId: event.roomId,
          userId: event.userId,
          type: event.type,
        }, "Canvas duplicate event")
        channel.ack(msg)
        return
      }

      recordError()
      recordErrorDetail({
        stage: "consume",
        type: event.type,
        message: error instanceof Error ? error.message : "Canvas consumer error",
      })
      logger.error({
        stage: "consume",
        eventId: event.id,
        roomId: event.roomId,
        userId: event.userId,
        type: event.type,
        durationMs: Date.now() - startedAt,
        error,
      }, "Canvas consumer error")

      // ❗ DO NOT ACK → RabbitMQ retry
    }
  })
}