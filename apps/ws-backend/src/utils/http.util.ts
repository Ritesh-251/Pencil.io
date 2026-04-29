const fallbackLocalOrigins = ["http://localhost:3000", "http://127.0.0.1:3000"];

const configuredOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedOrigins =
  configuredOrigins.length > 0 ? configuredOrigins : fallbackLocalOrigins;

type HeaderBag = Record<string, string | string[] | undefined>;
type RequestLike = {
  headers?: HeaderBag;
};

export function normalizeHeaderValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function resolveCorsOrigin(req: RequestLike) {
  const origin = normalizeHeaderValue(req?.headers?.origin);
  if (!origin) return allowedOrigins[0] || "http://localhost:3000";
  if (allowedOrigins.includes(origin)) return origin;
  return null;
}

export function withCorsHeaders(
  req: RequestLike,
  headers: Record<string, string> = {},
) {
  const origin = resolveCorsOrigin(req);
  return {
    "access-control-allow-origin":
      origin || allowedOrigins[0] || "http://localhost:3000",
    vary: "Origin",
    "access-control-allow-methods": "GET,POST,PUT,OPTIONS",
    "access-control-allow-headers":
      "content-type,authorization,x-upload-token,x-upload-expires,x-upload-content-type",
    ...headers,
  };
}
