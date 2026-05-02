import { Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware";
import { prisma } from "@repo/db";
import { ApiError } from "../utils/ApiError";
import { notificationService } from "../services/notification.service";

export const createTask = async (req: AuthRequest, res: Response) => {
  try {
    const { title, description, status, priority, dueDate, roomId, meetingId, assigneeId } = req.body;

    if (!title) {
      throw new ApiError(400, "Title is required");
    }

    // 🔥 SECURITY FIX: SEC-4 (IDOR)
    // Verify room membership before creating a task in a room
    if (roomId) {
      const isMember = await prisma.roomMember.findUnique({
        where: { userId_roomId: { userId: req.userId!, roomId } }
      });
      if (!isMember) {
        throw new ApiError(403, "Not a member of this room");
      }
    }

    const task = await prisma.task.create({
      data: {
        title,
        description: description || null,
        status: status || "TODO",
        priority: priority || "MEDIUM",
        dueDate: dueDate ? new Date(dueDate) : null,
        userId: req.userId!,
        roomId: roomId || null,
        meetingId: meetingId || null,
        assigneeId: assigneeId || null,
      },
      include: {
        meeting: { select: { title: true } },
        assignee: { select: { email: true, avatarUrl: true } }
      }
    });

    // Notify assignee if it's someone else
    if (assigneeId && assigneeId !== req.userId) {
      try {
        await notificationService.createNotification({
          userId: assigneeId,
          type: "TASK_ASSIGNED",
          title: "New Action Item",
          content: `You've been assigned: ${title}`,
          metadata: { taskId: task.id, roomId: task.roomId }
        });
      } catch (e) {
        console.error("[TaskController] Failed to create notification:", e);
      }
    }

    return res.status(201).json({ task });
  } catch (error: any) {
    const status = error instanceof ApiError ? error.statusCode : 500;
    return res.status(status).json({ message: error.message || "Internal server error" });
  }
};

export const getMyTasks = async (req: AuthRequest, res: Response) => {
  try {
    const { roomId } = req.query;

    const tasks = await prisma.task.findMany({
      where: {
        OR: [
          { userId: req.userId! },
          { assigneeId: req.userId! }
        ],
        ...(roomId ? { roomId: String(roomId) } : {}),
      },
      include: {
        room: { select: { name: true } },
        meeting: { select: { title: true } },
        assignee: { select: { email: true, avatarUrl: true } }
      },
      orderBy: { createdAt: "desc" },
    });

    return res.status(200).json({ tasks });
  } catch (error: any) {
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const updateTask = async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const { title, description, status, priority, dueDate, assigneeId } = req.body;

    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) throw new ApiError(404, "Task not found");
    if (task.userId !== req.userId && task.assigneeId !== req.userId) throw new ApiError(403, "Unauthorized");

    const updatedTask = await prisma.task.update({
      where: { id },
      data: {
        title: title !== undefined ? title : undefined,
        description: description !== undefined ? description : undefined,
        status: status !== undefined ? status : undefined,
        priority: priority !== undefined ? priority : undefined,
        dueDate: dueDate !== undefined ? (dueDate ? new Date(dueDate) : null) : undefined,
        assigneeId: assigneeId !== undefined ? assigneeId : undefined,
      },
      include: {
        assignee: { select: { email: true, avatarUrl: true } },
        room: { select: { name: true } }
      }
    });

    // Notify new assignee if changed
    if (assigneeId && assigneeId !== task.assigneeId && assigneeId !== req.userId) {
      try {
        await notificationService.createNotification({
          userId: assigneeId,
          type: "TASK_ASSIGNED",
          title: "New Task Delegated",
          content: `You've been assigned: ${updatedTask.title}`,
          metadata: { taskId: updatedTask.id, roomId: updatedTask.roomId }
        });
      } catch (e) {
        console.error("[TaskController] Failed to notify on reassignment:", e);
      }
    }

    return res.status(200).json({ task: updatedTask });
  } catch (error: any) {
    const status = error instanceof ApiError ? error.statusCode : 500;
    return res.status(status).json({ message: error.message || "Internal server error" });
  }
};

export const deleteTask = async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;

    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) throw new ApiError(404, "Task not found");
    if (task.userId !== req.userId) throw new ApiError(403, "Unauthorized");

    await prisma.task.delete({ where: { id } });
    return res.status(200).json({ message: "Task deleted" });
  } catch (error: any) {
    const status = error instanceof ApiError ? error.statusCode : 500;
    return res.status(status).json({ message: error.message || "Internal server error" });
  }
};
