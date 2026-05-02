import { Request, Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware";
import { notificationService } from "../services/notification.service";
import { ApiError } from "../utils/ApiError";

export class NotificationController {
  async getNotifications(req: AuthRequest, res: Response) {
    const userId = req.userId!;
    const notifications = await notificationService.getNotifications(userId);
    res.json({ notifications });
  }

  async markAsRead(req: AuthRequest, res: Response) {
    const userId = req.userId!;
    const id = req.params.id as string;
    await notificationService.markAsRead(id, userId);
    res.json({ success: true });
  }

  async markAllAsRead(req: AuthRequest, res: Response) {
    const userId = req.userId!;
    await notificationService.markAllAsRead(userId);
    res.json({ success: true });
  }
}

export const notificationController = new NotificationController();
