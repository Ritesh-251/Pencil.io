import { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";
import { logger } from "../infra/logger";

/**
 * Middleware to ensure every request has a unique Trace ID (x-trace-id).
 * It also attaches a child logger to the request for traced logging.
 */
export const traceMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const traceId = (req.headers["x-trace-id"] as string) || uuidv4();

  // Attach metadata to request
  (req as any).traceId = traceId;
  (req as any).logger = logger.child({ traceId });

  // Attach to response
  res.setHeader("x-trace-id", traceId);

  next();
};
