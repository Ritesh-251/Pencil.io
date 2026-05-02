import { rateLimit } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { pubsub } from "../infra/redis";
import { logger } from "../infra/logger";

const WINDOW_MS = 60_000;

export const createRedisRateLimiter = (limit: number, prefix: string) => {
  return rateLimit({
    windowMs: WINDOW_MS,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    store: new RedisStore({
      // @ts-expect-error - ioredis client compatibility
      sendCommand: (...args: string[]) => pubsub.getClient().call(...args),
      prefix: `rl:ws:${prefix}:`,
    }),
    handler: (req, res, _next, options) => {
      logger.warn({ path: req.path, ip: req.ip, prefix }, "WS rate limit exceeded");
      res.status(429).json({
        message: "Too many requests, please try again later.",
        retryAfterMs: options.windowMs,
      });
    },
  });
};
