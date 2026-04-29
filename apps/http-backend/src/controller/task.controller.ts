import { Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware";
import { prisma } from "@repo/db";
import { ApiError } from "../utils/ApiError";

export const createTask = async (req: AuthRequest, res: Response) => {
  try {
    const { title, status, priority, dueDate, roomId } = req.body;

    if (!title) {
      throw new ApiError(400, "Title is required");
    }

    const task = await prisma.task.create({
      data: {
        title,
        status: status || "TODO",
        priority: priority || "MEDIUM",
        dueDate: dueDate ? new Date(dueDate) : null,
        userId: req.userId!,
        roomId: roomId || null,
      },
    });

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
        userId: req.userId!,
        ...(roomId ? { roomId: String(roomId) } : {}),
      },
      include: {
        room: { select: { name: true } }
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
    const { id } = req.params;
    const { title, status, priority, dueDate } = req.body;

    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) throw new ApiError(404, "Task not found");
    if (task.userId !== req.userId) throw new ApiError(403, "Unauthorized");

    const updatedTask = await prisma.task.update({
      where: { id },
      data: {
        title: title !== undefined ? title : undefined,
        status: status !== undefined ? status : undefined,
        priority: priority !== undefined ? priority : undefined,
        dueDate: dueDate !== undefined ? (dueDate ? new Date(dueDate) : null) : undefined,
      },
    });

    return res.status(200).json({ task: updatedTask });
  } catch (error: any) {
    const status = error instanceof ApiError ? error.statusCode : 500;
    return res.status(status).json({ message: error.message || "Internal server error" });
  }
};

export const deleteTask = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

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
