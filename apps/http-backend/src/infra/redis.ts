import { RedisPubSub } from "@repo/redis";

export const pubsub = new RedisPubSub("http-backend");

export async function initRedis() {
  await pubsub.connect();
}
