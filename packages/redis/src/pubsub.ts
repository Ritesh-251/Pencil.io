import Redis from "ioredis";

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

    const retryStrategy = (times: number) => Math.min(times * 200, 5000)

    this.pub = new Redis(redisUrl, { retryStrategy });
    this.sub = new Redis(redisUrl, { retryStrategy });

    this.pub.on("connect", () => {
      console.log("[RedisPubSub] Publisher connected");
      this.healthy = true
    });

    this.sub.on("connect", () => {
      console.log("[RedisPubSub] Subscriber connected");
      this.healthy = true
    });

    this.pub.on("error", (err) => {
      this.healthy = false
      console.error("[RedisPubSub] Publisher error", err);
    });

    this.sub.on("error", (err) => {
      this.healthy = false
      console.error("[RedisPubSub] Subscriber error", err);
    });

    await this.sub.subscribe(RedisPubSub.CHANNEL);
  }

  isHealthy() {
    return this.healthy
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
      console.error("[RedisPubSub] publish failed", {
        error: err,
        event: fullEvent,
      });
    }
  }

  async tryAcquireLock(key: string, value: string, ttlMs: number): Promise<boolean> {
    if (!this.pub) {
      throw new Error("RedisPubSub not connected. Call connect() first.")
    }

    const result = await this.pub.set(key, value, "PX", ttlMs, "NX")
    return result === "OK"
  }

  async releaseLock(key: string, value: string): Promise<boolean> {
    if (!this.pub) {
      throw new Error("RedisPubSub not connected. Call connect() first.")
    }

    const script =
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end"
    const deleted = await this.pub.eval(script, 1, key, value)
    return deleted === 1
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
        console.warn("[RedisPubSub] Invalid JSON:", message);
        return;
      }

      if (
        !parsed ||
        typeof parsed.type !== "string" ||
        typeof parsed.roomId !== "string" ||
        typeof parsed.origin !== "string"
      ) {
        console.warn("[RedisPubSub] Malformed event:", parsed);
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
