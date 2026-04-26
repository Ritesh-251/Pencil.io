import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import { prisma } from "@repo/db";
import { redisClient } from "./infra/redis";
import { generalRateLimitMiddleware } from "./middleware/generalRateLimit.middleware";
import { logger } from "./infra/logger";
import { swaggerSpec } from "./infra/swagger";

const app: express.Application = express();

// 1. Security Headers
app.use(helmet());

const fallbackLocalOrigins = [
	"http://localhost:3000",
	"http://127.0.0.1:3000",
];

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
	})
);

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(cookieParser());

// 2. Global Rate Limiting
app.use(generalRateLimitMiddleware);

// 3. API Documentation
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

/**
 * @openapi
 * /health:
 *   get:
 *     description: Returns the health status of the system and its dependencies.
 *     responses:
 *       200:
 *         description: System is healthy.
 */
app.get("/health", async (_req, res) => {
	try {
		const dbPromise = prisma.$queryRaw`SELECT 1`;
		const redisPromise = redisClient.ping();

		const timeout = new Promise((_, reject) =>
			setTimeout(() => reject(new Error("Health check timeout")), 5000)
		);

		await Promise.race([Promise.all([dbPromise, redisPromise]), timeout]);

		res.status(200).json({
			status: "ok",
			timestamp: new Date().toISOString(),
			services: {
				database: "healthy",
				redis: "healthy",
			},
		});
	} catch (error) {
		logger.error({ err: error }, "Deep health check failed");
		res.status(503).json({
			status: "unhealthy",
			timestamp: new Date().toISOString(),
			error: error instanceof Error ? error.message : "Unknown error",
		});
	}
});

import userRouter from "./routes/auth.routes";
import roomsRouter from "./routes/rooms.index.routes";
import internalRouter from "./routes/internal.routes";

app.use("/api/v1/auth", userRouter);
app.use("/api/v1/users", userRouter);
app.use("/api/v1/rooms", roomsRouter);
app.use("/api/internal", internalRouter);

export { app };
