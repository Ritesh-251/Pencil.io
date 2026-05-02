import { Router } from "express";
import { notificationController } from "../controller/notification.controller";
import { authMiddleware } from "../middleware/auth.middleware";

const router: Router = Router();

router.use(authMiddleware);

router.get("/", notificationController.getNotifications);
router.patch("/:id/read", notificationController.markAsRead);
router.post("/read-all", notificationController.markAllAsRead);

export default router;
