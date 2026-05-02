import dotenv from "dotenv";
dotenv.config();

import { WsBackendEnvSchema } from "@repo/validation";

// Validate environment before anything else
try {
  WsBackendEnvSchema.parse(process.env);
} catch (error: any) {
  console.error("❌ Invalid environment configuration:", error.format());
  process.exit(1);
}

(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

import { initRabbitMQ, onRabbitReady, closeRabbitMQ } from "./infra/rabbitmq";
import { startChatConsumer } from "./consumers/chat.consumer";
import { startBroadcastConsumer } from "./consumers/broadcast.consumer";
import { startCanvasConsumer } from "./consumers/canvas.consumer";
import { prisma } from "@repo/db";
import { startSocketServer, socketManager } from "./socketServer";
import { initRedis, pubsub } from "./infra/redis";
import { roomManager } from "./manager/roomManager";
import { startCompactionScheduler } from "./compaction/scheduler";
import { startQueueMonitor } from "./monitor/queueMonitor";
import { startMetricsEngine } from "./monitor/metrics";
import { logger } from "./infra/logger";

async function bootstrap() {
  try {
    startMetricsEngine();

    await prisma.$connect();
    logger.info({ stage: "consume", type: "BOOT" }, "Postgres connected");

    await initRedis();
    logger.info({ stage: "consume", type: "BOOT" }, "Redis connected");

    onRabbitReady(async () => {
      await startChatConsumer();
      await startBroadcastConsumer();
      await startCanvasConsumer();
    });

    await initRabbitMQ();

    startCompactionScheduler();
    startQueueMonitor();

    pubsub.subscribe((event) => {
      roomManager.broadCast(event.roomId, {
        type: event.type,
        payload: event.payload,
      });
    });

    pubsub.pSubscribe("notifications:*", (channel, message) => {
      const userId = channel.split(":")[1];
      if (!userId) return;

      try {
        const parsed = JSON.parse(message);
        // Direct delivery to all user's active sockets
        socketManager.sendToUser(userId, {
          type: "notification:new",
          payload: parsed.notification
        });
      } catch (err) {
        logger.warn({ channel, message }, "Failed to parse notification event");
      }
    });

    const server = await startSocketServer();

    // Q-12 FIX: Register SIGTERM / SIGINT handlers for graceful Kubernetes
    // rolling-deploy shutdown.  Without this, the old pod is killed mid-
    // transaction, leaving RabbitMQ messages unacked and triggering requeue
    // storms.
    const shutdown = async (signal: string) => {
      logger.info(
        { signal },
        "Shutdown signal received — draining and exiting",
      );
      // 1. Stop accepting new WS upgrades / HTTP requests
      server.close();
      // 2. Close the RabbitMQ channel so in-flight confirms can drain
      await closeRabbitMQ().catch(() => {});
      // 3. Disconnect from Redis
      await pubsub.disconnect().catch(() => {});
      // 4. Release the DB pool
      await prisma.$disconnect().catch(() => {});
      logger.info("Graceful shutdown complete");
      process.exit(0);
    };

    process.on("SIGTERM", () => void shutdown("SIGTERM"));
    process.on("SIGINT", () => void shutdown("SIGINT"));
  } catch (err) {
    logger.error(
      { err, stage: "consume", type: "BOOT" },
      "Server failed to start",
    );
    process.exit(1);
  }
}

bootstrap();
