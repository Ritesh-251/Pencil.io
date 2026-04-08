import { NextFunction, Request, Response } from "express"

type Bucket = {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

const WINDOW_MS = Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 60_000)
const MAX_REQUESTS = Number(process.env.AUTH_RATE_LIMIT_MAX || 20)
const REFRESH_WINDOW_MS = Number(process.env.AUTH_REFRESH_RATE_LIMIT_WINDOW_MS || 60_000)
const REFRESH_MAX_REQUESTS = Number(process.env.AUTH_REFRESH_RATE_LIMIT_MAX || 120)

function clientKey(req: Request) {
  const forwarded = req.headers["x-forwarded-for"]
  const ip = typeof forwarded === "string"
    ? forwarded.split(",")[0]?.trim()
    : req.ip

  return `${ip || "unknown"}:${req.path}`
}

export function authRateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
  const isRefreshRoute = req.path.includes('/refresh')
  const windowMs = isRefreshRoute ? REFRESH_WINDOW_MS : WINDOW_MS
  const maxRequests = isRefreshRoute ? REFRESH_MAX_REQUESTS : MAX_REQUESTS
  const key = clientKey(req)
  const now = Date.now()
  const bucket = buckets.get(key)

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, {
      count: 1,
      resetAt: now + windowMs,
    })
    next()
    return
  }

  if (bucket.count >= maxRequests) {
    const retryAfterMs = Math.max(0, bucket.resetAt - now)
    res.setHeader("retry-after", String(Math.ceil(retryAfterMs / 1000)))
    console.warn('[auth-rate-limit] blocked request', {
      path: req.path,
      key,
      count: bucket.count,
      limit: maxRequests,
      retryAfterMs,
    })
    res.status(429).json({ message: "Too many requests", retryAfterMs })
    return
  }

  bucket.count += 1
  buckets.set(key, bucket)
  next()
}
