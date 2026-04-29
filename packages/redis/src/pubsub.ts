import Redis from "ioredis";
import { createLogger, Logger } from "@repo/common";

const logger = createLogger("redis-pubsub");

type WSRedisEvent = {
  type: string;
  roomId: string;
  payload: any;
  origin: string;
};

export class RedisPubSub {
  private serverId: string;
  private pub!: Redis;
  private sub!: Redis;
  private healthy = false;
  private static CHANNEL = "ws-events";

  constructor(serverId: string) {
    this.serverId = serverId;
  }

  async connect() {
    const redisUrl = process.env.REDIS_URL;

    if (!redisUrl) {
      throw new Error("REDIS_URL is not defined");
    }

    const retryStrategy = (times: number) => Math.min(times * 200, 5000);

    this.pub = new Redis(redisUrl, { retryStrategy });
    this.sub = new Redis(redisUrl, { retryStrategy });

    this.pub.on("connect", () => {
      logger.info({ serverId: this.serverId }, "Publisher connected");
      this.healthy = true;
    });

    this.sub.on("connect", () => {
      logger.info({ serverId: this.serverId }, "Subscriber connected");
      this.healthy = true;
    });

    this.pub.on("error", (err) => {
      this.healthy = false;
      logger.error({ err, serverId: this.serverId }, "Publisher error");
    });

    this.sub.on("error", (err) => {
      this.healthy = false;
      logger.error({ err, serverId: this.serverId }, "Subscriber error");
    });

    await this.sub.subscribe(RedisPubSub.CHANNEL);
  }

  isHealthy() {
    return this.healthy;
  }

  async publish(event: Omit<WSRedisEvent, "origin">) {
    if (!this.pub) {
      throw new Error("RedisPubSub not connected. Call connect() first.");
    }

    const fullEvent: WSRedisEvent = {
      ...event,
      origin: this.serverId,
    };

    try {
      await this.pub.publish(RedisPubSub.CHANNEL, JSON.stringify(fullEvent));
    } catch (err) {
      logger.error(
        {
          err,
          event: fullEvent,
          serverId: this.serverId,
        },
        "publish failed",
      );
    }
  }

  async tryAcquireLock(
    key: string,
    value: string,
    ttlMs: number,
  ): Promise<boolean> {
    if (!this.pub) {
      throw new Error("RedisPubSub not connected. Call connect() first.");
    }

    const result = await this.pub.set(key, value, "PX", ttlMs, "NX");
    return result === "OK";
  }

  async releaseLock(key: string, value: string): Promise<boolean> {
    if (!this.pub) {
      throw new Error("RedisPubSub not connected. Call connect() first.");
    }

    const script =
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";
    const deleted = await this.pub.eval(script, 1, key, value);
    return deleted === 1;
  }

  subscribe(handler: (event: WSRedisEvent) => void) {
    if (!this.sub) {
      throw new Error("RedisPubSub not connected. Call connect() first.");
    }

    this.sub.on("message", (channel, message) => {
      if (channel !== RedisPubSub.CHANNEL) return;

      let parsed: WSRedisEvent;

      try {
        parsed = JSON.parse(message);
      } catch {
        logger.warn({ message, serverId: this.serverId }, "Invalid JSON");
        return;
      }

      if (
        !parsed ||
        typeof parsed.type !== "string" ||
        typeof parsed.roomId !== "string" ||
        typeof parsed.origin !== "string"
      ) {
        logger.warn({ parsed, serverId: this.serverId }, "Malformed event");
        return;
      }

      // 🔥 prevent infinite loop
      if (parsed.origin === this.serverId) {
        return;
      }

      handler(parsed);
    });
  }

  async disconnect() {
    if (this.pub) await this.pub.quit();
    if (this.sub) await this.sub.quit();
  }
}
