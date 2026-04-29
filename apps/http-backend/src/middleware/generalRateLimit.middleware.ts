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
  limit: MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  store,
  handler: (req, res, _next, options) => {
    logger.warn({ path: req.path, ip: req.ip }, "General rate limit exceeded");
    res
      .status(429)
      .json({
        message: "Too many requests, please try again later.",
        retryAfterMs: options.windowMs,
      });
  },
});
