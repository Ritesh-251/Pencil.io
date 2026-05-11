import dotenv from "dotenv";
dotenv.config();

import { AiServiceEnvSchema } from "@repo/validation";

// Validate environment before anything else
try {
  AiServiceEnvSchema.parse(process.env);
} catch (error: any) {
  console.error("❌ Invalid environment configuration:", error.format());
  process.exit(1);
}

import { prisma } from "@repo/db";
import { app } from "./app";
import { logger } from "./infra/logger";
import { ensureAiSchema } from "./schema.bootstrap";
import { validateAiEnvironment } from "./ai.routes";
import { initRabbitMQ, onRabbitReady, rabbitClient } from "./infra/rabbitmq";
import { startIngestConsumer } from "./consumers/ingest.consumer";

const PORT = process.env.PORT;


async function startServer() {
  try {
    validateAiEnvironment();
    await prisma.$connect();
    await ensureAiSchema();
    logger.info("Postgres client connected");

    onRabbitReady(async () => {
      await startIngestConsumer();
    });
    await initRabbitMQ();

    const server = app.listen(PORT, () => {
      logger.info({ port: PORT }, "AI service started");
    });

    // Q-12 FIX: Graceful shutdown so Kubernetes rolling deploys don't kill
    // in-flight AI jobs or leave RabbitMQ messages permanently unacked.
    const shutdown = async (signal: string) => {
      logger.info(
        { signal },
        "Shutdown signal received — draining and exiting",
      );
      server.close(async () => {
        await rabbitClient.close().catch((err) => logger.error({ err }, "Failed to close RabbitMQ"));
        await prisma.$disconnect().catch((err) => logger.error({ err }, "Failed to disconnect Prisma"));
        logger.info("Graceful shutdown complete");
        process.exit(0);
      });
    };

    process.on("SIGTERM", () => void shutdown("SIGTERM"));
    process.on("SIGINT", () => void shutdown("SIGINT"));
  } catch (error) {
    logger.error(
      {
        err:
          error instanceof Error
            ? { name: error.name, message: error.message, stack: error.stack }
            : error,
      },
      "Failed to start AI service",
    );
    process.exit(1);
  }
}

void startServer();
