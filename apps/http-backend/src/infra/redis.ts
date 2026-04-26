import { RedisPubSub } from "@repo/redis";
import Redis from "ioredis";

export const pubsub = new RedisPubSub("http-backend");

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  throw new Error("REDIS_URL is not defined");
}

export const redisClient = new Redis(redisUrl, {
  retryStrategy: (times: number) => Math.min(times * 200, 5000),
});

export async function initRedis() {
  await pubsub.connect();
}
