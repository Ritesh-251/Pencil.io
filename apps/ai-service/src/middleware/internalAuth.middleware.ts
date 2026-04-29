import { Request, Response, NextFunction } from "express";
import { AiServiceEnvSchema } from "@repo/validation";
import { logger } from "../infra/logger";

let internalSecret: string | null = null;

function getInternalSecret() {
  if (!internalSecret) {
    const config = AiServiceEnvSchema.parse(process.env);
    internalSecret = config.INTERNAL_SECRET;
  }
  return internalSecret;
}

export const internalAuthMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    logger.warn(
      { path: req.path },
      "Missing or invalid internal authorization header",
    );
    return res.status(401).json({ message: "Unauthorized internal request" });
  }

  const token = authHeader.split(" ")[1];
  if (token !== getInternalSecret()) {
    logger.warn({ path: req.path }, "Internal secret mismatch");
    return res.status(403).json({ message: "Forbidden internal request" });
  }

  next();
};
