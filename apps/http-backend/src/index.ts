import dotenv from "dotenv";
dotenv.config();

import { HttpBackendEnvSchema } from "@repo/validation";

// Validate environment before anything else
try {
  HttpBackendEnvSchema.parse(process.env);
} catch (error: any) {
  console.error("❌ Invalid environment configuration:", error.format());
  process.exit(1);
}

import { prisma } from "@repo/db";
import { app } from "./app";
import { logger } from "./infra/logger";
import { initRedis } from "./infra/redis";
import { initRabbitMQ, onRabbitReady } from "./infra/rabbitmq";
import { startEmailConsumer } from "./consumers/email.consumer";

const PORT = process.env.PORT;
async function startServer() {
  try {
    await prisma.$connect();
    logger.info("Postgres client connected")
    await initRedis();
    logger.info("Redis connected");

    onRabbitReady(async () => {
      await startEmailConsumer();
    });

    await initRabbitMQ();
    logger.info("RabbitMQ connected");

    app.listen(PORT, () => {
      logger.info({ port: PORT }, "HTTP backend started")
    });
  } catch (error) {
    logger.error({ err: error }, "DB connection failed")
    process.exit(1);
  }
}

startServer();
