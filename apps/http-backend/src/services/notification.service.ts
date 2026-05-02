import { prisma } from "@repo/db";
import { pubsub } from "../infra/redis";

export enum NotificationType {
  MENTION = "MENTION",
  TASK_ASSIGNED = "TASK_ASSIGNED",
  ROOM_INVITE = "ROOM_INVITE",
  ROOM_ACTIVITY = "ROOM_ACTIVITY",
  SYSTEM = "SYSTEM"
}

export class NotificationService {
  async createNotification(params: {
    userId: string;
    type: string;
    title: string;
    content: string;
    metadata?: any;
  }) {
    const notification = await prisma.notification.create({
      data: {
        userId: params.userId,
        type: params.type as any,
        title: params.title,
        content: params.content,
        metadata: params.metadata || {},
      },
    });

    // Broadcast to user's real-time session
    try {
      await pubsub.publish({
        type: "notification:new",
        roomId: "GLOBAL", // Notifications are global for the user
        payload: {
          type: "NEW_NOTIFICATION",
          notification
        }
      });
    } catch (e) {
      console.error("[NotificationService] Redis publish failed:", e);
    }

    return notification;
  }

  async getNotifications(userId: string, limit = 20) {
    return prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  async markAsRead(notificationId: string, userId: string) {
    return prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { isRead: true },
    });
  }

  async markAllAsRead(userId: string) {
    return prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }
}

export const notificationService = new NotificationService();
