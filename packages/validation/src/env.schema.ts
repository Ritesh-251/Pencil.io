import { z } from "zod";

export const CommonEnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  ACCESS_TOKEN_SECRET: z.string().min(8),
});

export const HttpBackendEnvSchema = CommonEnvSchema.extend({
  PORT: z
    .string()
    .transform(Number)
    .default(3001 as any),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  AI_SERVICE_URL: z.string().url(),
  LIVEKIT_URL: z.string().url(),
  LIVEKIT_API_KEY: z.string(),
  LIVEKIT_API_SECRET: z.string(),
  INTERNAL_SECRET: z.string(),
  RABBITMQ_URL: z.string().url(),
  FRONTEND_URL: z.string().url().default("http://localhost:3000"),
  SMTP_HOST: z.string(),
  SMTP_PORT: z
    .string()
    .transform(Number)
    .default(465 as any),
  SMTP_USER: z.string().email(),
  SMTP_PASS: z.string(),
});

export const WsBackendEnvSchema = CommonEnvSchema.extend({
  PORT: z
    .string()
    .transform(Number)
    .default(3003 as any),
  RABBITMQ_URL: z.string().url(),
  IMAGE_UPLOAD_BASE_URL: z.string().url(),
  IMAGE_CDN_BASE_URL: z.string().url(),
  IMAGE_UPLOAD_SIGNING_SECRET: z.string().optional(),
});

export const AiServiceEnvSchema = CommonEnvSchema.extend({
  PORT: z
    .string()
    .transform(Number)
    .default(3004 as any),
  RABBITMQ_URL: z.string().url(),
  GEMINI_API_KEY: z.string(),
  GEMINI_CHAT_MODEL: z.string().default("gemini-2.5-flash"),
  GEMINI_SUMMARY_MODEL: z.string().default("gemini-2.5-flash"),
  GEMINI_EMBED_MODEL: z.string().default("gemini-embedding-2"),
  GEMINI_EMBED_DIMENSION: z
    .string()
    .transform(Number)
    .default(1536 as any),
  OLLAMA_BASE_URL: z.string().url().default("http://localhost:11434"),
  OLLAMA_MODEL: z.string().default("qwen3.5:2b"),
  // SEC-1 FIX: No default — a missing INTERNAL_SECRET now causes a startup
  // crash rather than silently running with a known public value.
  INTERNAL_SECRET: z
    .string()
    .min(32, "INTERNAL_SECRET must be at least 32 characters"),
});

export type HttpBackendEnv = z.infer<typeof HttpBackendEnvSchema>;
export type WsBackendEnv = z.infer<typeof WsBackendEnvSchema>;
export type AiServiceEnv = z.infer<typeof AiServiceEnvSchema>;
