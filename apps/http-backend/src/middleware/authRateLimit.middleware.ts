import { rateLimit } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { redisClient } from "../infra/redis";
import { logger } from "../infra/logger";

const WINDOW_MS = Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 60_000);
const MAX_REQUESTS = Number(process.env.AUTH_RATE_LIMIT_MAX || 20);

const REFRESH_WINDOW_MS = Number(process.env.AUTH_REFRESH_RATE_LIMIT_WINDOW_MS || 60_000);
const REFRESH_MAX_REQUESTS = Number(process.env.AUTH_REFRESH_RATE_LIMIT_MAX || 120);

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
  max: MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  store: authStore,
  keyGenerator: (req) => {
    const forwarded = req.headers["x-forwarded-for"];
    const ip = typeof forwarded === "string"
      ? forwarded.split(",")[0]?.trim()
      : req.ip;
    return `${ip || "unknown"}:${req.path}`;
  },
  handler: (req, res, _next, options) => {
    logger.warn({
      path: req.path,
      ip: req.ip,
      limit: options.limit,
    }, "Rate limit exceeded");

    res.status(429).json({
      message: "Too many requests",
      retryAfterMs: options.windowMs,
    });
  },
  skip: (req) => req.path.includes('/refresh'), // Skip the main limiter for refresh route
});

export const refreshRateLimitMiddleware = rateLimit({
  windowMs: REFRESH_WINDOW_MS,
  max: REFRESH_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  store: refreshStore,
  keyGenerator: (req) => {
    const forwarded = req.headers["x-forwarded-for"];
    const ip = typeof forwarded === "string"
      ? forwarded.split(",")[0]?.trim()
      : req.ip;
    return `${ip || "unknown"}:refresh`;
  },
  handler: (req, res, _next, options) => {
    logger.warn({
      path: req.path,
      ip: req.ip,
      limit: options.limit,
    }, "Refresh rate limit exceeded");

    res.status(429).json({
      message: "Too many requests",
      retryAfterMs: options.windowMs,
    });
  },
});
