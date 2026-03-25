import { RedisPubSub } from "@repo/redis";
import crypto from "crypto";

const SERVER_ID = crypto.randomUUID();

console.log("[Redis] Server ID:", SERVER_ID);

export const pubsub = new RedisPubSub(SERVER_ID);

export async function initRedis() {
  console.log("[Redis] Connecting...");
  await pubsub.connect();
  console.log("[Redis] Connected");
}

export { SERVER_ID };
