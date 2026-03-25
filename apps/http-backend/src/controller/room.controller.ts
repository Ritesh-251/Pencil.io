import { prisma } from "@repo/db";
import { ApiError } from "../utils/ApiError";
import { AuthRequest } from "../middleware/auth.middleware";
import { Response } from "express";
import {
  createRoomSchema,
  joinRoomSchema,
  leaveRoomSchema,
  deleteRoomSchema,
} from "@repo/validation";

export const createRoom = async function (req: AuthRequest, res: Response) {
  try {
    const parsed = createRoomSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: parsed.error.issues[0]?.message ?? "Validation error",
      });
    }
    const userId = req.userId;
    if (!userId) throw new ApiError(401, "Unauthorized");
    const { name, visibility } = parsed.data;
    const room = await prisma.room.create({
      data: {
        name,
        createdBy: userId,
        memberCount: 1,
        members: {
          create: {
            userId,
            role: "ADMIN",
          },
        },
      },
      select: {
        id: true,
        name: true,
        createdAt: true,
      },
    });

    return res.status(201).json({
      room,
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

export const joinRoom = async function (req: AuthRequest, res: Response) {
  try {
    const parsed = joinRoomSchema.safeParse(req.params);
    if (!parsed.success) {
      return res.status(400).json({
        message: parsed.error.issues[0]?.message ?? "Validation error",
      });
    }

    const userId = req.userId;
    if (!userId) throw new ApiError(401, "Unauthorized");
    const roomId = parsed.data.roomId as string;
    if (!roomId) throw new ApiError(400, "Room ID required");
    const room = await prisma.room.findUnique({
      where: {
        id: roomId,
      },
    });

    if (!room) {
      throw new ApiError(404, "Room not found");
    }
    if (room.visibility === "PRIVATE") {
      throw new ApiError(403, "Room is private");
    }
    const existingMember = await prisma.roomMember.findUnique({
      where: {
        userId_roomId: {
          userId,
          roomId,
        },
      },
    });
    if (existingMember) {
      throw new ApiError(400, "Already joined this room");
    }
    if (room.memberCount >= 100) {
      throw new ApiError(400, "Room is full");
    }
    await prisma.roomMember.create({
      data: {
        userId,
        roomId,
      },
    });
    await prisma.room.update({
      where: { id: roomId },
      data: { memberCount: { increment: 1 } },
    });
    return res.status(200).json({
      message: "Joined room successfully",
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
export const leaveRoom = async function (req: AuthRequest, res: Response) {
  try {
    const parsed = joinRoomSchema.safeParse(req.params);
    if (!parsed.success) {
      return res.status(400).json({
        message: parsed.error.issues[0]?.message ?? "Validation error",
      });
    }
    const userId = req.userId;
    if (!userId) throw new ApiError(401, "Unauthorized");
    const roomId = parsed.data.roomId as string;
    if (!roomId) throw new ApiError(400, "Room ID required");
    await prisma.$transaction(async (tx) => {
      const room = await tx.room.findUnique({
        where: { id: roomId },
      });
      if (!room) {
        throw new ApiError(404, "Room not found");
      }
      const memberValid = await tx.roomMember.findUnique({
        where: {
          userId_roomId: {
            userId,
            roomId,
          },
        },
      });
      if (!memberValid) {
        throw new ApiError(404, "User not part of the room");
      }
      await tx.roomMember.delete({
        where: {
          userId_roomId: {
            userId,
            roomId,
          },
        },
      });
      const updatedRoom = await tx.room.update({
        where: { id: roomId },
        data: { memberCount: { decrement: 1 } },
      });
      if (updatedRoom.memberCount === 0) {
        await tx.room.delete({
          where: { id: roomId },
        });
        return;
      }
      if ((room.createdBy = userId)) {
        const existingAdmin = await tx.roomMember.findFirst({
          where: {
            roomId,
            role: "ADMIN",
          },
          orderBy: {
            joinedAt: "asc",
          },
        });
        if (existingAdmin) {
          await tx.room.update({
            where: { id: roomId },
            data: { createdBy: existingAdmin.userId },
          });
        } else {
          const nextMember = await tx.roomMember.findFirst({
            where: { roomId },
            orderBy: { joinedAt: "asc" },
          });
          if (nextMember) {
            await tx.room.update({
              where: { id: roomId },
              data: { createdBy: nextMember.userId },
            });

            await tx.roomMember.update({
              where: {
                userId_roomId: {
                  userId: nextMember.userId,
                  roomId,
                },
              },
              data: { role: "ADMIN" },
            });
          }
        }
      }
    });
    return res.status(200).json({
      message: "Left room successfully",
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
export const DeleteRoom = async function (req: AuthRequest, res: Response) {
  try {
    const parsed = joinRoomSchema.safeParse(req.params);
    if (!parsed.success) {
      return res.status(400).json({
        message: parsed.error.issues[0]?.message ?? "Validation error",
      });
    }
    const userId = req.userId;
    if (!userId) throw new ApiError(401, "Unauthorized");
    const roomId = parsed.data.roomId as string;
    if (!roomId) throw new ApiError(400, "Room ID required");

    const room = await prisma.room.findUnique({
      where: { id: roomId },
    });
    if (!room) throw new ApiError(404, "Room not found");
    if (room.createdBy !== userId)
      throw new ApiError(403, "Only owner can delete room");

    await prisma.room.delete({
      where: { id: roomId },
    });
    return res.status(200).json({
      message: "Room deleted",
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
export const getRooms = async function (req: AuthRequest, res: Response) {
  try {
    const userId = req.userId;
    if (!userId) throw new ApiError(401, "Unauthorized");

    const rooms = await prisma.roomMember.findMany({
      where: {
        userId,
      },
      include: {
        room: {
          select: {
            id: true,
            name: true,
            memberCount: true,
            visibility: true,
            createdAt: true,

            messages: {
              orderBy: {
                createdAt: "desc",
              },
              take: 1,
              select: {
                content: true,
                createdAt: true,
              },
            },
          },
        },
      },
      orderBy: {
        joinedAt: "desc",
      },
    });
    const formatted = rooms.map((r) => ({
      roomId: r.room.id,
      name: r.room.name,
      role: r.role,
      memberCount: r.room.memberCount,
      visibility: r.room.visibility,
      lastMessage: r.room.messages[0] ?? null,
    }));

    return res.status(200).json({
      rooms: formatted,
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
