import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

const app: express.Application = express();

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

app.use(express.json());
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(cookieParser());

app.get("/health", (_req, res) => {
	res.status(200).json({ status: "ok" })
})

import userRouter from "./routes/auth.routes";
import roomRouter from "./routes/room.routes";
import messageRouter from "./routes/message.routes";
import adminRouter from "./routes/admin.routes";
app.use("/api/v1/auth", userRouter);
app.use("/api/v1/users", userRouter);
app.use("/api/v1/rooms", roomRouter);
app.use("/api/v1/rooms", messageRouter);
app.use("/api/v1/rooms", adminRouter);
export { app };
