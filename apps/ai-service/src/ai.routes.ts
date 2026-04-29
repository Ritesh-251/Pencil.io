import { Router, Request, Response, NextFunction } from "express";
import { aiController } from "./controllers/ai.controller";
import { logger } from "./infra/logger";

const router: Router = Router();

const isInternalAuthorized = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const adminToken = process.env.INTERNAL_SECRET;

  if (process.env.NODE_ENV === "development" && !adminToken) {
    logger.warn(
      "INTERNAL_SECRET not set — internal endpoints unprotected (development only)",
    );
    return next();
  }

  if (!adminToken) {
    res.status(401).json({ message: "Internal auth not configured" });
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${adminToken}`) {
    res.status(403).json({ message: "Forbidden: Invalid internal token" });
    return;
  }

  next();
};

// Routes mapped to Controller methods
router.post(
  "/:roomId/ingest",
  isInternalAuthorized,
  aiController.ingest.bind(aiController),
);
router.post(
  "/:roomId/query",
  isInternalAuthorized,
  aiController.query.bind(aiController),
);
router.post(
  "/:roomId/summary",
  isInternalAuthorized,
  aiController.summary.bind(aiController),
);

/**
 * Kept for backward compatibility with index.ts initialization
 * Though validation is now handled by Zod in index.ts
 */
export function validateAiEnvironment() {
  logger.info("AI environment validated via Zod");
}

export default router;
