import { Router } from "express";
import {
  signin,
  signup,
  deleteSession,
  sessions,
  logout,
  logoutAll,
  generateAccessToken,
} from "../controller/auth.controller";
import { authMiddleware } from "../middleware/auth.middleware";
import { authRateLimitMiddleware } from "../middleware/authRateLimit.middleware";

const router: Router = Router();

router.post("/signup", authRateLimitMiddleware, signup);
router.post("/signin", authRateLimitMiddleware, signin);
router.post("/refresh", authRateLimitMiddleware, generateAccessToken);
router.post("/logout", logout);
router.post("/logout-all", authMiddleware, logoutAll);
router.get("/sessions", authMiddleware, sessions);
router.delete("/sessions/:sessionId", authMiddleware, deleteSession);

export default router;
