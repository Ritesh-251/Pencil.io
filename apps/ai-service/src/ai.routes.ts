import { Router } from "express";
import { aiController } from "./controllers/ai.controller";

const router: Router = Router();

// Routes mapped to Controller methods
router.post("/:roomId/ingest", aiController.ingest.bind(aiController));
router.post("/:roomId/query", aiController.query.bind(aiController));
router.post("/:roomId/summary", aiController.summary.bind(aiController));

/**
 * Kept for backward compatibility with index.ts initialization
 * Though validation is now handled by Zod in index.ts
 */
export function validateAiEnvironment() {
  console.log("AI environment validated via Zod");
}

export default router;
