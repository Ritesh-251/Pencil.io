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
import { initRedis, redisClient } from "./infra/redis";
import { initRabbitMQ, onRabbitReady, rabbitClient } from "./infra/rabbitmq";
import { startEmailConsumer } from "./consumers/email.consumer";

const PORT = process.env.PORT;

async function startServer() {
  try {
    await prisma.$connect();
    logger.info("Postgres client connected");
    await initRedis();
    logger.info("Redis connected");

    onRabbitReady(async () => {
      await startEmailConsumer();
    });

    await initRabbitMQ();
    logger.info("RabbitMQ connected");

    const server = app.listen(PORT, () => {
      logger.info({ port: PORT }, "HTTP backend started");
    });

    // Q-12 FIX: Graceful shutdown on SIGTERM / SIGINT so rolling deploys don't
    // kill in-flight requests or leave RabbitMQ messages unacked.
    const shutdown = async (signal: string) => {
      logger.info(
        { signal },
        "Shutdown signal received — draining and exiting",
      );
      server.close(async () => {
        await rabbitClient.close().catch(() => {});
        await redisClient.quit().catch(() => {});
        await prisma.$disconnect().catch(() => {});
        logger.info("Graceful shutdown complete");
        process.exit(0);
      });
    };

    process.on("SIGTERM", () => void shutdown("SIGTERM"));
    process.on("SIGINT", () => void shutdown("SIGINT"));
  } catch (error) {
    logger.error({ err: error }, "DB connection failed");
    process.exit(1);
  }
}

startServer();
