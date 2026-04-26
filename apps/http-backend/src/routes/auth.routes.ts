import { Router } from "express";
import {
  signin,
  signup,
  deleteSession,
  sessions,
  logout,
  logoutAll,
  generateAccessToken,
  verifyEmail,
  resendVerification,
} from "../controller/auth.controller";
import { authMiddleware } from "../middleware/auth.middleware";
import { authRateLimitMiddleware, refreshRateLimitMiddleware } from "../middleware/authRateLimit.middleware";

const router: Router = Router();

/**
 * @openapi
 * /api/v1/auth/verify:
 *   get:
 *     tags: [Auth]
 *     summary: Verify user email via token
 *     parameters:
 *       - in: query
 *         name: token
 *         schema:
 *           type: string
 *         required: true
 *     responses:
 *       200:
 *         description: Email verified successfully
 */
router.get("/verify", verifyEmail);

/**
 * @openapi
 * /api/v1/auth/resend-verification:
 *   post:
 *     tags: [Auth]
 *     summary: Resend verification email
 *     responses:
 *       200:
 *         description: Verification email resent
 */
router.post("/resend-verification", authMiddleware, resendVerification);

/**
 * @openapi
 * /api/v1/auth/signup:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       201:
 *         description: User created successfully
 */
router.post("/signup", authRateLimitMiddleware, signup);

/**
 * @openapi
 * /api/v1/auth/signin:
 *   post:
 *     tags: [Auth]
 *     summary: Authenticate user and return tokens
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 */
router.post("/signin", authRateLimitMiddleware, signin);

router.post("/refresh", refreshRateLimitMiddleware, generateAccessToken);
router.post("/logout", logout);
router.post("/logout-all", authMiddleware, logoutAll);
router.get("/sessions", authMiddleware, sessions);
router.delete("/sessions/:sessionId", authMiddleware, deleteSession);

export default router;
