import { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";
import { logger } from "../infra/logger";

export const traceMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const traceId = (req.headers["x-trace-id"] as string) || uuidv4();
  (req as any).traceId = traceId;
  (req as any).logger = logger.child({ traceId });
  res.setHeader("x-trace-id", traceId);
  next();
};
