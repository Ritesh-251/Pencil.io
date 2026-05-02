import { Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware";
import { prisma } from "@repo/db";
import { ApiError } from "../utils/ApiError";
import { getChannel } from "../infra/rabbitmq";

export const scheduleMeeting = async (req: AuthRequest, res: Response) => {
  try {
    const { title, startTime, endTime, roomId, attendees, roomName } = req.body;

    if (!title || !startTime || !endTime) {
      throw new ApiError(400, "Missing required fields");
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new ApiError(400, "Invalid date format");
    }

    if (start >= end) {
      throw new ApiError(400, "Start time must be before end time");
    }

    const result = await prisma.$transaction(async (tx) => {
      let targetRoomId = roomId;

      // 🔥 SECURITY FIX: SEC-4 (IDOR)
      // If roomId provided, verify room membership before scheduling
      if (targetRoomId) {
        const isMember = await tx.roomMember.findUnique({
          where: { userId_roomId: { userId: req.userId!, roomId: targetRoomId } }
        });
        if (!isMember) {
          throw new ApiError(403, "Not a member of this room");
        }
      }

      // If no roomId provided, create a new dedicated room for this meeting
      if (!targetRoomId) {
        const newRoom = await tx.room.create({
          data: {
            name: roomName || `${title} Space`,
            visibility: "PUBLIC",
            createdBy: req.userId!,
            memberCount: 1,
            members: {
              create: { userId: req.userId!, role: "ADMIN" },
            },
          }
        });
        targetRoomId = newRoom.id;
      }

      const meeting = await tx.scheduledMeeting.create({
        data: {
          title,
          startTime: start,
          endTime: end,
          roomId: targetRoomId,
          creatorId: req.userId!,
          attendees: attendees || [],
        },
        include: {
          room: { select: { name: true } }
        }
      });

      // Create prep tasks if provided
      const { prepTasks } = req.body;
      if (prepTasks && Array.isArray(prepTasks)) {
        await tx.task.createMany({
          data: prepTasks.map((tTitle: string) => ({
            title: tTitle,
            userId: req.userId!,
            roomId,
            meetingId: meeting.id,
            priority: "MEDIUM",
            status: "TODO"
          }))
        });
      }

      return meeting;
    });

    // Send invitations via RabbitMQ
    if (attendees && attendees.length > 0) {
      const channel = getChannel();
      const payload = {
        type: "MEETING_INVITATION",
        payload: {
          title,
          startTime,
          roomName: result.room?.name || "General",
          emails: attendees,
          roomId
        }
      };
      channel.publish("events.exchange", "email.task", Buffer.from(JSON.stringify(payload)), { persistent: true });
    }

    return res.status(201).json({ meeting: result });
  } catch (error: any) {
    const status = error instanceof ApiError ? error.statusCode : 500;
    return res
      .status(status)
      .json({ message: error.message || "Internal server error" });
  }
};

export const getMyMeetings = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    // If email is missing from request, we fetch it once from the DB
    let userEmail = req.userEmail;
    if (!userEmail) {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      userEmail = user?.email;
    }

    const meetings = await prisma.scheduledMeeting.findMany({
      where: {
        OR: [
          { creatorId: userId },
          ...(userEmail ? [{ attendees: { has: userEmail } }] : []),
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
    const meeting = await prisma.scheduledMeeting.findUnique({ 
      where: { id },
      include: { room: { select: { createdBy: true } } }
    });

    if (!meeting) throw new ApiError(404, "Meeting not found");
    
    // Check if user is creator OR if they are an admin in the room
    const isAdmin = await prisma.roomMember.findUnique({
      where: { userId_roomId: { userId: req.userId!, roomId: meeting.roomId } }
    });

    const isAuthorized = 
      meeting.creatorId === req.userId || 
      (isAdmin && isAdmin.role === "ADMIN") ||
      meeting.room.createdBy === req.userId;

    if (!isAuthorized) {
      throw new ApiError(403, "Unauthorized to delete this meeting");
    }

    await prisma.scheduledMeeting.delete({ where: { id } });
    return res.status(200).json({ message: "Meeting deleted" });
  } catch (error: any) {
    const status = error instanceof ApiError ? error.statusCode : 500;
    return res
      .status(status)
      .json({ message: error.message || "Internal server error" });
  }
};
