import { Router } from "express";
import { getMessages } from "../controller/message.controller";
import { authMiddleware } from "../middleware/auth.middleware";

const router: Router = Router();

router.get("/:roomId/messages", authMiddleware, getMessages);

export default router;
