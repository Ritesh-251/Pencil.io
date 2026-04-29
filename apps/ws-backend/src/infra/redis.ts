import { RedisPubSub } from "@repo/redis";
import crypto from "crypto";
import { logger } from "./logger";

const SERVER_ID = crypto.randomUUID();

logger.info({ serverId: SERVER_ID }, "Redis server id assigned");

export const pubsub = new RedisPubSub(SERVER_ID);

export async function initRedis() {
  logger.info("Redis connecting");
  await pubsub.connect();
  logger.info("Redis connected");
}

export function isRedisHealthy() {
  return pubsub.isHealthy();
}

export async function safePublish(event: {
  type: string;
  roomId: string;
  payload: any;
}) {
  try {
    await pubsub.publish(event);
  } catch (error) {
    logger.error(
      {
        error,
        eventType: event.type,
        roomId: event.roomId,
      },
      "Redis publish failed; local-only fallback",
    );
  }
}

export async function acquireDistributedLock(
  key: string,
  token: string,
  ttlMs: number,
) {
  return pubsub.tryAcquireLock(key, token, ttlMs);
}

export async function releaseDistributedLock(key: string, token: string) {
  return pubsub.releaseLock(key, token);
}

export { SERVER_ID };
