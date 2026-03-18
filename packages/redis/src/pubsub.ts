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
  private static CHANNEL = "ws-events";

  constructor(serverId: string) {
    this.serverId = serverId;
  }

  async connect() {
    const redisUrl = process.env.REDIS_URL;

    if (!redisUrl) {
      throw new Error("REDIS_URL is not defined");
    }

    this.pub = new Redis(redisUrl);
    this.sub = new Redis(redisUrl);

 
    this.pub.on("connect", () => {
      console.log("[RedisPubSub] Publisher connected");
    });

    this.sub.on("connect", () => {
      console.log("[RedisPubSub] Subscriber connected");
    });

    this.sub.on("error", (err) => {
      console.error("[RedisPubSub] Subscriber error", err);
    });

    await this.sub.subscribe(RedisPubSub.CHANNEL);
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
      await this.pub.publish(
        RedisPubSub.CHANNEL,
        JSON.stringify(fullEvent)
      );
    } catch (err) {
      console.error("[RedisPubSub] publish failed", {
        error: err,
        event: fullEvent,
      });
    }
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