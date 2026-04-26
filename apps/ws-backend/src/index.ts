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
import { initRabbitMQ, onRabbitReady } from "./infra/rabbitmq";
import { startChatConsumer } from "./consumers/chat.consumer"
import { startBroadcastConsumer } from "./consumers/broadcast.consumer"
import { startCanvasConsumer } from "./consumers/canvas.consumer"
import { prisma } from "@repo/db";
import { startSocketServer } from "./socketServer";
import { initRedis, pubsub } from "./infra/redis";
import { roomManager } from "./manager/roomManager";
import { startCompactionScheduler } from "./compaction/scheduler";
import { startQueueMonitor } from "./monitor/queueMonitor";
import { startMetricsEngine } from "./monitor/metrics";
import { logger } from "./infra/logger";

async function bootstrap() {
  try {
    startMetricsEngine()
 
    await prisma.$connect();
    logger.info({ stage: "consume", type: "BOOT" }, "Postgres connected");

    await initRedis();
    logger.info({ stage: "consume", type: "BOOT" }, "Redis connected");

    onRabbitReady(async () => {
      await startChatConsumer()
      await startBroadcastConsumer()
      await startCanvasConsumer()
    })

    await initRabbitMQ()   

  startCompactionScheduler()
  startQueueMonitor()

  

    pubsub.subscribe((event) => {
      roomManager.broadCast(event.roomId, {
        type: event.type,
        payload: event.payload,
      });
    });

    await startSocketServer();
  } catch (err) {
    logger.error({ err, stage: "consume", type: "BOOT" }, "Server failed to start");
    process.exit(1);
  }
}

bootstrap();
