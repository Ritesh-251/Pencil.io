import dotenv from "dotenv";
dotenv.config();

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

function validateEnv() {
  const required = [
    "DATABASE_URL",
    "RABBITMQ_URL",
    "REDIS_URL",
    "ACCESS_TOKEN_SECRET",
    "IMAGE_UPLOAD_BASE_URL",
    "IMAGE_CDN_BASE_URL",
  ]

  if (process.env.NODE_ENV === "production") {
    required.push("IMAGE_UPLOAD_SIGNING_SECRET")
  }

  const missing = required.filter((key) => !process.env[key])
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`)
  }
}

async function bootstrap() {
  try {
    validateEnv()
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
      roomManager.broadCast(event.roomId, event.payload);
    });

    await startSocketServer();
  } catch (err) {
    logger.error({ err, stage: "consume", type: "BOOT" }, "Server failed to start");
    process.exit(1);
  }
}

bootstrap();
