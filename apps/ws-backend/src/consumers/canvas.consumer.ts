import { ConsumeMessage } from "amqplib";
import { getChannel } from "../infra/rabbitmq";
import { roomManager } from "../manager/roomManager";
import { safePublish } from "../infra/redis";
import { CanvasActionType, prisma } from "@repo/db";
import { triggerSnapshot } from "../utils/canvas.util";
import {
  handleUndo,
  handleRedo,
  saveHistory,
} from "../services/canvas.history.service";
import { mergeCRDT } from "../crdt/merge";
import { normalizeLogicalTimestamp } from "../crdt/hlc";
import { logEvent, logger } from "../infra/logger";
import {
  recordCanvasConsumerLagMs,
  recordError,
  recordErrorDetail,
  recordProcessingLatencyMs,
} from "../monitor/metrics";

const roomEventCountSinceSnapshot = new Map<string, number>();
const MAX_TRACKED_ROOMS = 10000;
const SNAPSHOT_EVERY_EVENTS = Number(process.env.SNAPSHOT_EVERY_EVENTS || 200);

function updateRoomEventCount(roomId: string) {
  const current = (roomEventCountSinceSnapshot.get(roomId) || 0) + 1;

  if (
    roomEventCountSinceSnapshot.size > MAX_TRACKED_ROOMS &&
    !roomEventCountSinceSnapshot.has(roomId)
  ) {
    // Basic eviction: clear map if it gets too large to prevent unbounded growth
    // In a production app, an LRU cache or Redis-backed counter would be better.
    roomEventCountSinceSnapshot.clear();
  }

  roomEventCountSinceSnapshot.set(roomId, current);
  return current;
}
function toDbVersion(logicalTimeMs: number): bigint {
  // Logical clock is in ms. Persist as BigInt to maintain full precision.
  return BigInt(Math.floor(logicalTimeMs));
}

function mapCanvasActionToHistoryAction(action: string): CanvasActionType {
  if (action === "CREATE_OBJECT") return CanvasActionType.CREATE;
  if (action === "UPDATE_OBJECT") return CanvasActionType.UPDATE;
  if (action === "DELETE_OBJECT") return CanvasActionType.DELETE;
  throw new Error(`Unsupported canvas action: ${action}`);
}

function mapHistoryActionToCanvasAction(actionType: CanvasActionType): string {
  if (actionType === CanvasActionType.CREATE) return "CREATE_OBJECT";
  if (actionType === CanvasActionType.UPDATE) return "UPDATE_OBJECT";
  if (actionType === CanvasActionType.DELETE) return "DELETE_OBJECT";
  return String(actionType);
}

export async function startCanvasConsumer() {
  const channel = getChannel();

  await channel.consume("canvas.queue", async (msg: ConsumeMessage | null) => {
    if (!msg) return;

    let event;
    try {
      event = JSON.parse(msg.content.toString());
    } catch (err) {
      logger.error({ err }, "Failed to parse canvas message");
      channel.nack(msg, false, false);
      return;
    }

    const startedAt = Date.now();
    recordCanvasConsumerLagMs(
      Date.now() - Number(event.timestamp || Date.now()),
    );

    const eventTime = Number(
      event?.payload?.timestamp?.time || event.timestamp || Date.now(),
    );
    recordProcessingLatencyMs(Date.now() - eventTime);

    try {
      const result = await prisma.$transaction(async (tx) => {
        // 🔥 1. EVENT DEDUP (CRITICAL)
        try {
          await tx.processedEvent.create({
            data: {
              eventId: event.id,
            },
          });
        } catch (err: any) {
          if (err.code === "P2002") {
            logger.info(
              { eventId: event.id, stage: "consume" },
              "Canvas dedup: event already processed",
            );
            return null; // skip entire processing
          }
          throw err;
        }

        const logicalTimestamp = normalizeLogicalTimestamp(
          event?.payload?.timestamp,
          event.userId,
        );
        const version = toDbVersion(logicalTimestamp.time);

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
          );

          return {
            type: "undo",
            version,
            timestamp: logicalTimestamp,
            result: undone,
          };
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
          );

          return {
            type: "redo",
            version,
            timestamp: logicalTimestamp,
            result: redone,
          };
        }

        // ======================
        // 🎨 NORMAL OBJECT EVENT
        // ======================
        if (event.type !== "canvas.draw") return null;

        const { objectId, action, data } = event.payload;
        const props =
          data?.props && typeof data.props === "object" ? data.props : data;
        if (
          action === "UPDATE_OBJECT" &&
          props?._translate &&
          typeof props._translate.dx === "number" &&
          typeof props._translate.dy === "number"
        ) {
          return {
            type: "object",
            version,
            timestamp: logicalTimestamp,
            objectId,
            action,
            data,
            transient: true,
          };
        }

        const existing = await tx.canvasObject.findUnique({
          where: { id: objectId },
        });

        let beforeState: any = existing?.crdt || null;

        // Always merge — CRDT resolves conflicts.

        const incoming = {
          props: action === "DELETE_OBJECT" ? { deleted: true } : data || {},
          timestamp: logicalTimestamp,
        };

        const merged = mergeCRDT((existing?.crdt as any) ?? null, incoming);

        const objectType =
          existing?.type ||
          (typeof data?.type === "string" ? data.type : "shape");

        // 🔥 3. REDO INVALIDATION
        const redoCandidate = await tx.canvasActionHistory.findFirst({
          where: {
            roomId: event.roomId,
            userId: event.userId,
            isUndone: true,
            isRedoInvalidated: false,
          },
          select: { id: true },
        });

        if (redoCandidate) {
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
          });
        }

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
        });

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
        });

        return {
          type: "object",
          version,
          timestamp: logicalTimestamp,
          objectId,
          action,
          data,
        };
      });
      // ======================
      // 🚫 NOTHING TO DO (DEDUP OR INVALID)
      // ======================
      if (!result) {
        channel.ack(msg);
        return;
      }

      // ======================
      // 🔁 UNDO BROADCAST
      // ======================
      if (result.type === "undo") {
        if (!result.result) {
          channel.ack(msg);
          return;
        }

        const outgoing = {
          type: "canvas:object",
          payload: {
            objectId: result.result.objectId,
            action: mapHistoryActionToCanvasAction(result.result.actionType),
            data: {
              type: result.result.resolvedProps?.type,
              props: result.result.resolvedProps,
            },
            timestamp: result.timestamp,
            userId: event.userId,
          },
        };

        roomManager.broadCast(event.roomId, outgoing);

        await safePublish({
          type: "canvas:object",
          roomId: event.roomId,
          payload: outgoing.payload,
        });

        logEvent("broadcast", event, {
          subtype: "undo",
          durationMs: Date.now() - startedAt,
        });

        channel.ack(msg);
        return;
      }

      // ======================
      // 🔁 REDO BROADCAST
      // ======================
      if (result.type === "redo") {
        if (!result.result) {
          channel.ack(msg);
          return;
        }

        const outgoing = {
          type: "canvas:object",
          payload: {
            objectId: result.result.objectId,
            action: mapHistoryActionToCanvasAction(result.result.actionType),
            data: {
              type: result.result.resolvedProps?.type,
              props: result.result.resolvedProps,
            },
            timestamp: result.timestamp,
            userId: event.userId,
          },
        };

        roomManager.broadCast(event.roomId, outgoing);

        await safePublish({
          type: "canvas:object",
          roomId: event.roomId,
          payload: outgoing.payload,
        });

        logEvent("broadcast", event, {
          subtype: "redo",
          durationMs: Date.now() - startedAt,
        });

        channel.ack(msg);
        return;
      }

      // ======================
      // 🎨 OBJECT BROADCAST
      // ======================
      if (result.type === "object") {
        const currentCount = result.transient
          ? 0
          : updateRoomEventCount(event.roomId);

        if (!result.transient && currentCount >= SNAPSHOT_EVERY_EVENTS) {
          triggerSnapshot(event.roomId, result.version);
          roomEventCountSinceSnapshot.set(event.roomId, 0);
        }

        logEvent("consume", event, {
          subtype: "object",
          durationMs: Date.now() - startedAt,
        });

        const outgoing = {
          type: "canvas:object",
          payload: {
            objectId: result.objectId,
            action: result.action,
            data: result.data,
            timestamp: result.timestamp,
            userId: event.userId,
          },
        };

        roomManager.broadCast(event.roomId, outgoing);

        await safePublish({
          type: "canvas:object",
          roomId: event.roomId,
          payload: outgoing.payload,
        });

        logEvent("broadcast", event, {
          subtype: "object",
          durationMs: Date.now() - startedAt,
        });

        channel.ack(msg);
        return;
      }
    } catch (error: any) {
      // BUG-2 FIX: Only treat P2002 as a benign dedup hit when the collision is
      // on the ProcessedEvent table.  A P2002 on any other table is a real error
      // that should be NACKed so the message gets retried.
      const isProcessedEventDup =
        error.code === "P2002" &&
        Array.isArray(error.meta?.target) &&
        (error.meta.target as string[]).some((t: string) =>
          t.toLowerCase().includes("processedevent"),
        );

      if (isProcessedEventDup) {
        logger.info(
          {
            stage: "consume",
            eventId: event.id,
            roomId: event.roomId,
            userId: event.userId,
            type: event.type,
          },
          "Canvas duplicate event",
        );
        channel.ack(msg);
        return;
      }

      recordError();
      recordErrorDetail({
        stage: "consume",
        type: event.type,
        message:
          error instanceof Error ? error.message : "Canvas consumer error",
      });
      logger.error(
        {
          stage: "consume",
          eventId: event.id,
          roomId: event.roomId,
          userId: event.userId,
          type: event.type,
          durationMs: Date.now() - startedAt,
          error,
        },
        "Canvas consumer error",
      );

      // Simple retry logic: requeue once, then dead-letter.
      // RabbitMQ x-death header tracks delivery attempts.
      const deathHeader = msg.properties.headers?.["x-death"]?.[0];
      const retryCount = deathHeader?.count || 0;
      const MAX_RETRIES = Number(process.env.CANVAS_MAX_RETRIES ?? 3);

      if (retryCount < MAX_RETRIES) {
        logger.warn(
          { eventId: event.id, retryCount },
          "Canvas consumer: transient error, requeueing",
        );
        channel.nack(msg, false, true); // requeue = true
      } else {
        logger.error(
          { eventId: event.id, retryCount },
          "Canvas consumer: max retries reached, dead-lettering",
        );
        channel.nack(msg, false, false); // requeue = false (sends to DLX)
      }
    }
  });
}
