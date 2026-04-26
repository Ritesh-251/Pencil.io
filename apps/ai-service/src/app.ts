import cors from "cors";
import express from "express";
import aiRouter from "./ai.routes";

const app: express.Application = express();

const fallbackLocalOrigins = ["http://localhost:3000", "http://127.0.0.1:3000"];

const configuredOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
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

app.use(express.json({ limit: "50mb" }));
app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});
app.use("/ai", aiRouter);

export { app };
