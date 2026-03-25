import { Router } from "express";
import { kickUser, promoteUser } from "../controller/admin.controller";
import { authMiddleware } from "../middleware/auth.middleware";
const router: Router = Router();

router.delete("/:roomId/members/:userId", authMiddleware, kickUser);

router.patch("/:roomId/promote/:userId", authMiddleware, promoteUser);
export default router;
