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
import { ensureAiSchema } from "./schema.bootstrap";
import { validateAiEnvironment } from "./ai.routes";
import { initRabbitMQ, onRabbitReady } from "./infra/rabbitmq";
import { startIngestConsumer } from "./consumers/ingest.consumer";

const PORT = process.env.PORT;

import { createLogger } from "@repo/common";
const logger = createLogger("ai-service");

async function startServer() {
  try {
    validateAiEnvironment();
    await prisma.$connect();
    await ensureAiSchema();
    logger.info("Postgres client connected")

    onRabbitReady(async () => {
      await startIngestConsumer();
    });
    await initRabbitMQ();

    app.listen(PORT, () => {
      logger.info({ port: PORT }, "AI service started")
    });
  } catch (error) {
    logger.error({
      err: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error,
    }, "Failed to start AI service")
    process.exit(1);
  }
}

void startServer();
