import { Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware";
import { prisma } from "@repo/db";
import { ApiError } from "../utils/ApiError";

export const scheduleMeeting = async (req: AuthRequest, res: Response) => {
  try {
    const { title, startTime, endTime, roomId, attendees } = req.body;

    if (!title || !startTime || !endTime || !roomId) {
      throw new ApiError(400, "Missing required fields");
    }

    const meeting = await prisma.scheduledMeeting.create({
      data: {
        title,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        roomId,
        creatorId: req.userId!,
        attendees: attendees || [],
      },
    });

    return res.status(201).json({ meeting });
  } catch (error: any) {
    const status = error instanceof ApiError ? error.statusCode : 500;
    return res
      .status(status)
      .json({ message: error.message || "Internal server error" });
  }
};

export const getMyMeetings = async (req: AuthRequest, res: Response) => {
  try {
    const meetings = await prisma.scheduledMeeting.findMany({
      where: {
        OR: [
          { creatorId: req.userId! },
          { attendees: { has: req.userEmail } }, // Note: you might need to add email to AuthRequest
        ],
      },
      include: { room: { select: { name: true } } },
      orderBy: { startTime: "asc" },
    });

    return res.status(200).json({ meetings });
  } catch (error: any) {
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const deleteMeeting = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id || "");
    const meeting = await prisma.scheduledMeeting.findUnique({ where: { id } });

    if (!meeting) throw new ApiError(404, "Meeting not found");
    if (meeting.creatorId !== req.userId)
      throw new ApiError(403, "Unauthorized");

    await prisma.scheduledMeeting.delete({ where: { id } });
    return res.status(200).json({ message: "Meeting deleted" });
  } catch (error: any) {
    const status = error instanceof ApiError ? error.statusCode : 500;
    return res
      .status(status)
      .json({ message: error.message || "Internal server error" });
  }
};
