import { prisma } from "@repo/db";
import { ApiError } from "../utils/ApiError";
import { AuthRequest } from "../middleware/auth.middleware";
import { Response } from "express";

export const kickUser = async function (req: AuthRequest, res: Response) {
  try {

    const roomId = req.params.roomId as string
    const targetUserId = req.params.userId as string
    const requesterId = req.userId as string

    if (!roomId || !targetUserId) {
      throw new ApiError(400, "Room ID and User ID required")
    }
    

    const requester = await prisma.roomMember.findUnique({
      where: {
        userId_roomId: {
          userId: requesterId,
          roomId
        }
      }
    })

    if (!requester || requester.role !== "ADMIN") {
      throw new ApiError(403, "Only admins can kick users")
    }

    const room = await prisma.room.findUnique({
      where: { id: roomId }
    })

    if (room?.createdBy === targetUserId) {
      throw new ApiError(403, "Cannot kick the room owner")
    }

    await prisma.roomMember.delete({
      where: {
        userId_roomId: { userId: targetUserId, roomId }
      }
    })

    await prisma.room.update({
      where: { id: roomId },
      data: { memberCount: { decrement: 1 } }
    })

    return res.status(200).json({
      message: "User removed"
    })

  } catch (error) {

    if (error instanceof ApiError) {
      return res.status(error.statusCode).json({
        message: error.message
      })
    }

    console.error(error)

    return res.status(500).json({
      message: "Internal server error"
    })
  }
};


export const promoteUser = async function (req: AuthRequest, res: Response) {
  try {
    const roomId = req.params.roomId as string;
    const targetUserId = req.params.userId as string;
    const requesterId = req.userId as string;

    if (!roomId || !targetUserId) throw new ApiError(400, "Room ID and User ID required");

    const requester = await prisma.roomMember.findUnique({
      where: {
        userId_roomId: {
          userId: requesterId,
          roomId
        }
      }
    })

    if (!requester || requester.role !== "ADMIN") {
      throw new ApiError(403, "Only admins can promote users")
    }

    const room = await prisma.room.findUnique({
      where: { id: roomId }
    })

    if (room?.createdBy === targetUserId) {
      throw new ApiError(403, "Cannot change the room owner's role")
    }

    await prisma.roomMember.update({
      where: {
        userId_roomId: { userId: targetUserId, roomId },
      },
      data: { role: "ADMIN" },
    });

    return res.status(200).json({
      message: "User promoted",
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
