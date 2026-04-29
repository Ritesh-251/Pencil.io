import { prisma } from "@repo/db";
import { getQueueStats, isRabbitMQHealthy } from "../infra/rabbitmq";
import { isRedisHealthy } from "../infra/redis";
import { getMetricsSnapshot } from "../monitor/metrics";
import { isOverloaded } from "../monitor/systemLoad";
import { replayCanvas } from "../services/canvasReplay.service";

export async function getHealthStatus() {
  let db = "connected";
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
  } catch {
    db = "disconnected";
  }

  return {
    status:
      db === "connected" && isRabbitMQHealthy() && isRedisHealthy()
        ? "ok"
        : "degraded",
    db,
    rabbitmq: isRabbitMQHealthy() ? "connected" : "disconnected",
    redis: isRedisHealthy() ? "connected" : "disconnected",
  };
}

export async function getInternalStatus() {
  const canvas = await getQueueStats("canvas.queue");
  const chat = await getQueueStats("chat.queue");
  const dlq = await getQueueStats("canvas.dlq");

  const metrics = getMetricsSnapshot();

  const healthScore = deriveHealthScore({
    queueSize: Math.max(canvas.messageCount, chat.messageCount),
    consumerLag: metrics.consumerLag.canvasLag,
  });

  return {
    overloaded: isOverloaded(),
    queue: {
      canvas: {
        size: canvas.messageCount,
        consumers: canvas.consumerCount,
      },
      chat: {
        size: chat.messageCount,
      },
      dlq: {
        size: dlq.messageCount,
        recentErrors: metrics.recentErrors,
      },
    },
    healthScore,
    consumers: {
      canvasLag: metrics.consumerLag.canvasLag,
    },
    system: metrics.system,
    metrics: {
      ingressRate: metrics.ingressRate,
      errorRate: metrics.errorRate,
      dlqRate: metrics.dlqRate,
      backpressureTriggerCount: metrics.backpressureTriggerCount,
      processingLatency: metrics.processingLatency,
    },
  };
}

function deriveHealthScore(input: { queueSize: number; consumerLag: number }) {
  if (input.queueSize > 5000 || input.consumerLag > 2000) return "critical";
  if (input.queueSize > 1000) return "degraded";
  return "healthy";
}

export async function runReplayCheck(roomId: string, limit = 200) {
  const latest = await prisma.canvasActionHistory.findMany({
    where: { roomId },
    orderBy: [{ time: "desc" }, { actorId: "desc" }],
    take: limit,
  });

  if (latest.length === 0) {
    return {
      roomId,
      checkedEvents: 0,
      mismatches: [],
    };
  }

  const newestEvent = latest.at(0);
  const maxTime = Number(newestEvent?.time || 0);
  const touchedObjectIds = Array.from(new Set(latest.map((e) => e.objectId)));

  const replayed = await replayCanvas({
    roomId,
    fromTime: 0,
    toTime: maxTime,
  });

  const live = await prisma.canvasObject.findMany({
    where: {
      roomId,
      id: { in: touchedObjectIds },
    },
    select: {
      id: true,
      crdt: true,
    },
  });

  const liveMap = new Map(live.map((item) => [item.id, item.crdt]));
  const mismatches: string[] = [];

  for (const objectId of touchedObjectIds) {
    const replayCrdt = replayed.state.get(objectId);
    const liveCrdt = liveMap.get(objectId);

    const replayJson = JSON.stringify(replayCrdt || null);
    const liveJson = JSON.stringify(liveCrdt || null);

    if (replayJson !== liveJson) {
      mismatches.push(objectId);
    }
  }

  return {
    roomId,
    checkedEvents: latest.length,
    touchedObjects: touchedObjectIds.length,
    mismatches,
  };
}
