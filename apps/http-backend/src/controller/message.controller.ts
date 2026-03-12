import { prisma } from "@repo/db";
import { ApiError } from "../utils/ApiError";
import { AuthRequest } from "../middleware/auth.middleware";
import { Response } from "express";

export const getMessages = async function (req: AuthRequest, res: Response) {
  try {
    const roomId = req.params.roomId as string;
    const userId = req.userId;
    if (!userId) throw new ApiError(401, "Unauthorized");
    if (!roomId) throw new ApiError(400, "Room ID required");

    const member = await prisma.roomMember.findUnique({
      where: {
        userId_roomId: {
          userId,
          roomId,
        },
      },
    });

    if (!member) {
      throw new ApiError(403, "You are not a member of this room");
    }

    const messages = await prisma.message.findMany({
      where: { roomId },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        user: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });

    return res.status(200).json({
      messages: messages.reverse(),
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return res.status(error.statusCode).json({
        message: error.message,
      });
    }

    console.error(error);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
};
