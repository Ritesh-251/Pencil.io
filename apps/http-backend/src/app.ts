import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";

import { prisma } from "@repo/db";
import { redisClient } from "./infra/redis";
import { traceMiddleware } from "./middleware/trace.middleware";
import { generalRateLimitMiddleware } from "./middleware/generalRateLimit.middleware";
import { logger } from "./infra/logger";
import { swaggerSpec } from "./infra/swagger";

// Import Routers
import userRouter from "./routes/auth.routes";
import roomsRouter from "./routes/rooms.index.routes";
import internalRouter from "./routes/internal.routes";
import planningRouter from "./routes/planning.routes";
import taskRouter from "./routes/tasks.routes";
import notificationsRouter from "./routes/notifications.routes";

const app: express.Application = express();

// 0. Trace ID & Proxy (Required for rate-limiting and observability)
app.use(traceMiddleware);
app.set("trust proxy", 1);

// 1. Security Headers
app.use(helmet());

const fallbackLocalOrigins = ["http://localhost:3000", "http://127.0.0.1:3000"];

const configuredOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const allowedOrigins =
  configuredOrigins.length > 0 ? configuredOrigins : fallbackLocalOrigins;

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      const normalized = origin.replace(/\/$/, "");
      if (allowedOrigins.includes(normalized)) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  }),
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(cookieParser());

import passport from "./infra/passport";
app.use(passport.initialize());

// 2. Global Rate Limiting
app.use(generalRateLimitMiddleware);

// 3. API Documentation
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// 4. Health Check
app.get("/health", async (_req, res) => {
  try {
    const dbPromise = prisma.$queryRaw`SELECT 1`;
    const redisPromise = redisClient.ping();
    await Promise.all([dbPromise, redisPromise]);
    res
      .status(200)
      .json({
        status: "ok",
        services: { database: "healthy", redis: "healthy" },
      });
  } catch (error) {
    res.status(503).json({ status: "unhealthy" });
  }
});

// 6. API Routes
app.use("/api/v1/auth", userRouter);
app.use("/api/v1/rooms", roomsRouter);
app.use("/api/v1/planning", planningRouter);
app.use("/api/v1/tasks", taskRouter);
app.use("/api/v1/notifications", notificationsRouter);
app.use("/api/internal", internalRouter);

export { app };
