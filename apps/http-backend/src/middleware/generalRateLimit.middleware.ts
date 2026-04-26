import { rateLimit } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { redisClient } from "../infra/redis";
import { logger } from "../infra/logger";

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 100; // 100 requests per minute

const store = new RedisStore({
  // @ts-expect-error - ioredis client compatibility
  sendCommand: (...args: string[]) => redisClient.call(...args),
  prefix: "rl:gen:",
});

export const generalRateLimitMiddleware = rateLimit({
  windowMs: WINDOW_MS,
  max: MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  store,
  keyGenerator: (req) => {
    const forwarded = req.headers["x-forwarded-for"];
    const ip = typeof forwarded === "string"
      ? forwarded.split(",")[0]?.trim()
      : req.ip;
    return ip || "unknown";
  },
  handler: (req, res, _next, options) => {
    logger.warn({
      path: req.path,
      ip: req.ip,
      limit: options.limit,
    }, "General rate limit exceeded");

    res.status(429).json({
      message: "Too many requests, please try again later.",
      retryAfterMs: options.windowMs,
    });
  },
});
