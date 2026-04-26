import { prisma } from "@repo/db";
import { ApiError } from "../utils/ApiError";

export class RoomService {
  async createRoom(userId: string, name: string, visibility: "PUBLIC" | "PRIVATE") {
    return prisma.room.create({
      data: {
        name,
        visibility: visibility ?? "PUBLIC",
        createdBy: userId,
        memberCount: 1,
        members: {
          create: { userId, role: "ADMIN" },
        },
      },
      select: { id: true, name: true, createdAt: true },
    });
  }

  async joinRoom(userId: string, roomId: string) {
    const room = await prisma.room.findUnique({
      where: { id: roomId },
      select: { id: true, visibility: true },
    });

    if (!room) throw new ApiError(404, "Room not found");

    const existingMember = await prisma.roomMember.findUnique({
      where: { userId_roomId: { userId, roomId } },
    });
    if (existingMember) return { message: "Already a member" };

    if (room.visibility === "PRIVATE") {
      // Handle private room join request
      await prisma.joinRequest.upsert({
        where: { userId_roomId: { userId, roomId } },
        create: { userId, roomId, status: "PENDING" },
        update: { status: "PENDING" },
      });
      return { message: "Join request sent", status: "PENDING_APPROVAL" };
    }

    // Public room: Join immediately
    return prisma.$transaction(async (tx) => {
      await tx.roomMember.create({ data: { userId, roomId, role: "MEMBER" } });
      const updated = await tx.room.updateMany({
        where: { id: roomId, memberCount: { lt: 100 } },
        data: { memberCount: { increment: 1 } },
      });

      if (updated.count === 0) throw new ApiError(400, "Room is full");
      return { message: "Joined successfully", status: "MEMBER" };
    });
  }

  async leaveRoom(userId: string, roomId: string) {
    return prisma.$transaction(async (tx) => {
      const room = await tx.room.findUnique({ where: { id: roomId } });
      if (!room) throw new ApiError(404, "Room not found");

      const member = await tx.roomMember.findUnique({
        where: { userId_roomId: { userId, roomId } },
      });
      if (!member) throw new ApiError(404, "User not part of the room");

      await tx.roomMember.delete({ where: { userId_roomId: { userId, roomId } } });
      
      const updatedRoom = await tx.room.update({
        where: { id: roomId, memberCount: { gt: 0 } },
        data: { memberCount: { decrement: 1 } },
      });

      if (updatedRoom.memberCount === 0) {
        await tx.room.delete({ where: { id: roomId } });
        return { message: "Left and room deleted" };
      }

      if (room.createdBy === userId) {
        const nextAdmin = await tx.roomMember.findFirst({
          where: { roomId },
          orderBy: { joinedAt: "asc" },
        });
        if (nextAdmin) {
          await tx.room.update({
            where: { id: roomId },
            data: { createdBy: nextAdmin.userId },
          });
          await tx.roomMember.update({
            where: { userId_roomId: { userId: nextAdmin.userId, roomId } },
            data: { role: "ADMIN" },
          });
        }
      }
      return { message: "Left room successfully" };
    });
  }

  async deleteRoom(userId: string, roomId: string) {
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) throw new ApiError(404, "Room not found");
    if (room.createdBy !== userId) throw new ApiError(403, "Only owner can delete room");

    await prisma.room.delete({ where: { id: roomId } });
    return { message: "Room deleted" };
  }

  async listUserRooms(userId: string) {
    const memberships = await prisma.roomMember.findMany({
      where: { userId },
      include: {
        room: {
          select: {
            id: true,
            name: true,
            memberCount: true,
            visibility: true,
            createdAt: true,
            messages: {
              orderBy: { createdAt: "desc" },
              take: 1,
              select: { content: true, createdAt: true },
            },
          },
        },
      },
      orderBy: { joinedAt: "desc" },
    });

    return memberships.map((m) => ({
      roomId: m.room.id,
      name: m.room.name,
      role: m.role,
      memberCount: m.room.memberCount,
      visibility: m.room.visibility,
      lastMessage: m.room.messages[0] ?? null,
    }));
  }

  async updateRoomName(userId: string, roomId: string, name: string) {
    const membership = await prisma.roomMember.findUnique({
      where: { userId_roomId: { userId, roomId } },
    });
    if (!membership || membership.role !== "ADMIN") throw new ApiError(403, "Only admins can rename rooms");

    return prisma.room.update({
      where: { id: roomId },
      data: { name },
      select: { id: true, name: true },
    });
  }

  async getJoinRequests(roomId: string, userId: string) {
    const membership = await prisma.roomMember.findUnique({
      where: { userId_roomId: { userId, roomId } },
    });
    if (!membership || membership.role !== "ADMIN") throw new ApiError(403, "Access denied");

    return prisma.joinRequest.findMany({
      where: { roomId, status: "PENDING" },
      include: { user: { select: { id: true, email: true } } },
      orderBy: { createdAt: "asc" },
    });
  }

  async approveJoinRequest(roomId: string, requestId: string, adminUserId: string) {
    const adminMembership = await prisma.roomMember.findUnique({
      where: { userId_roomId: { userId: adminUserId, roomId } },
    });
    if (!adminMembership || adminMembership.role !== "ADMIN") throw new ApiError(403, "Access denied");

    const request = await prisma.joinRequest.findUnique({ where: { id: requestId } });
    if (!request || request.roomId !== roomId) throw new ApiError(404, "Request not found");

    return prisma.$transaction(async (tx) => {
      await tx.joinRequest.update({
        where: { id: requestId },
        data: { status: "APPROVED" },
      });

      const existingMember = await tx.roomMember.findUnique({
        where: { userId_roomId: { userId: request.userId, roomId } },
      });

      if (!existingMember) {
        await tx.roomMember.create({
          data: { userId: request.userId, roomId, role: "MEMBER" },
        });
        await tx.room.update({
          where: { id: roomId },
          data: { memberCount: { increment: 1 } },
        });
      }

      return { message: "Request approved" };
    });
  }

  async rejectJoinRequest(roomId: string, requestId: string, adminUserId: string) {
    const adminMembership = await prisma.roomMember.findUnique({
      where: { userId_roomId: { userId: adminUserId, roomId } },
    });
    if (!adminMembership || adminMembership.role !== "ADMIN") throw new ApiError(403, "Access denied");

    await prisma.joinRequest.update({
      where: { id: requestId },
      data: { status: "REJECTED" },
    });

    return { message: "Request rejected" };
  }

  async getRoomDetails(roomId: string, userId: string) {
    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: {
        members: {
          include: { user: { select: { id: true, email: true } } },
        },
      },
    });

    if (!room) throw new ApiError(404, "Room not found");

    const isMember = room.members.some((m) => m.userId === userId);
    if (room.visibility === "PRIVATE" && !isMember) {
      throw new ApiError(403, "Access denied to private room");
    }

    return room;
  }
}

export const roomService = new RoomService();
