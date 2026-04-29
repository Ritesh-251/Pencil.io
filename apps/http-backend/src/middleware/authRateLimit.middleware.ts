import { rateLimit } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { redisClient } from "../infra/redis";
import { logger } from "../infra/logger";

const WINDOW_MS = Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 60_000);
const MAX_REQUESTS = Number(process.env.AUTH_RATE_LIMIT_MAX || 20);

const REFRESH_WINDOW_MS = Number(
  process.env.AUTH_REFRESH_RATE_LIMIT_WINDOW_MS || 60_000,
);
const REFRESH_MAX_REQUESTS = Number(
  process.env.AUTH_REFRESH_RATE_LIMIT_MAX || 120,
);

// Redis store configurations
const authStore = new RedisStore({
  // @ts-expect-error - ioredis client compatibility
  sendCommand: (...args: string[]) => redisClient.call(...args),
  prefix: "rl:auth:",
});

const refreshStore = new RedisStore({
  // @ts-expect-error - ioredis client compatibility
  sendCommand: (...args: string[]) => redisClient.call(...args),
  prefix: "rl:refresh:",
});

export const authRateLimitMiddleware = rateLimit({
  windowMs: WINDOW_MS,
  limit: MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  store: authStore,
  handler: (req, res, _next, options) => {
    logger.warn({ path: req.path, ip: req.ip }, "Auth rate limit exceeded");
    res
      .status(429)
      .json({ message: "Too many requests", retryAfterMs: options.windowMs });
  },
  skip: (req) => req.path.includes("/refresh"),
});

export const refreshRateLimitMiddleware = rateLimit({
  windowMs: REFRESH_WINDOW_MS,
  limit: REFRESH_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  store: refreshStore,
  handler: (req, res, _next, options) => {
    logger.warn({ path: req.path, ip: req.ip }, "Refresh rate limit exceeded");
    res
      .status(429)
      .json({ message: "Too many requests", retryAfterMs: options.windowMs });
  },
});
