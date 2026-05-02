import { prisma } from "@repo/db";
import { ApiError } from "../utils/ApiError";
import { pubsub } from "../infra/redis";

export class RoomService {
  async createRoom(
    userId: string,
    name: string,
    visibility: "PUBLIC" | "PRIVATE",
  ) {
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
      select: {
        id: true,
        visibility: true,
        members: { where: { role: "ADMIN" }, select: { userId: true } },
      },
    });

    if (!room) throw new ApiError(404, "Room not found");

    const existingMember = await prisma.roomMember.findUnique({
      where: { userId_roomId: { userId, roomId } },
    });
    if (existingMember) return { message: "Already a member" };

    if (room.visibility === "PRIVATE") {
      // Handle private room join request
      const request = await prisma.joinRequest.upsert({
        where: { userId_roomId: { userId, roomId } },
        create: { userId, roomId, status: "PENDING" },
        update: { status: "PENDING" },
        include: { user: { select: { email: true } } },
      });
      await pubsub.publish({
        type: "room:event",
        roomId,
        payload: {
          type: "JOIN_REQUEST",
          requestId: request.id,
          userId,
          userEmail: request.user.email,
          adminUserIds: room.members.map((member) => member.userId),
        },
      });
      return {
        message: "Join request sent",
        status: "PENDING_APPROVAL",
        approvalRequired: true,
      };
    }

    // Public room: Join immediately
    const result = await prisma.$transaction(async (tx) => {
      // 🔥 CONCURRENCY FIX: CONC-1 (Race Condition)
      // Atomic increment with capacity check (100 members max)
      const roomUpdate = await tx.room.update({
        where: { id: roomId, memberCount: { lt: 100 } },
        data: { memberCount: { increment: 1 } },
        select: { id: true }
      }).catch(err => {
        // If the 'where' condition fails (e.g. memberCount >= 100), update returns null or throws.
        // Prisma throws P2025 (Record to update not found) if the where doesn't match.
        if (err.code === 'P2025') throw new ApiError(400, "Room is full");
        throw err;
      });

      await tx.roomMember.create({ data: { userId, roomId, role: "MEMBER" } });

      return { message: "Joined successfully", status: "MEMBER" };
    });
    return result;
  }

  async leaveRoom(userId: string, roomId: string) {
    const result = await prisma.$transaction(async (tx) => {
      const room = await tx.room.findUnique({ where: { id: roomId } });
      if (!room) throw new ApiError(404, "Room not found");

      const member = await tx.roomMember.findUnique({
        where: { userId_roomId: { userId, roomId } },
      });
      if (!member) throw new ApiError(404, "User not part of the room");

      await tx.roomMember.delete({
        where: { userId_roomId: { userId, roomId } },
      });

      const updatedRoom = await tx.room.update({
        where: { id: roomId, memberCount: { gt: 0 } },
        data: { memberCount: { decrement: 1 } },
      });

      if (updatedRoom.memberCount === 0) {
        await tx.room.update({
          where: { id: roomId },
          data: { isArchived: true }
        });
        return { message: "Left and room archived" };
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
    return result;
  }

  async deleteRoom(userId: string, roomId: string) {
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) throw new ApiError(404, "Room not found");
    if (room.createdBy !== userId)
      throw new ApiError(403, "Only owner can delete room");

    await prisma.room.delete({ where: { id: roomId } });
    return { message: "Room deleted" };
  }

  async listUserRooms(userId: string) {
    const memberships = await prisma.roomMember.findMany({
      where: { 
        userId,
        room: { isArchived: false }
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
    if (!membership || membership.role !== "ADMIN")
      throw new ApiError(403, "Only admins can rename rooms");

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
    if (!membership || membership.role !== "ADMIN")
      throw new ApiError(403, "Access denied");

    return prisma.joinRequest.findMany({
      where: { roomId, status: "PENDING" },
      include: { user: { select: { id: true, email: true } } },
      orderBy: { createdAt: "asc" },
    });
  }

  async approveJoinRequest(
    roomId: string,
    requestId: string,
    adminUserId: string,
  ) {
    const adminMembership = await prisma.roomMember.findUnique({
      where: { userId_roomId: { userId: adminUserId, roomId } },
    });
    if (!adminMembership || adminMembership.role !== "ADMIN")
      throw new ApiError(403, "Access denied");

    const request = await prisma.joinRequest.findUnique({
      where: { id: requestId },
    });
    if (!request || request.roomId !== roomId)
      throw new ApiError(404, "Request not found");

    const result = await prisma.$transaction(async (tx) => {
      // Q-4 FIX: Enforce the same 100-member cap that joinRoom enforces atomically.
      const room = await tx.room.findUnique({
        where: { id: roomId },
        select: { id: true },
      });
      if (!room) throw new ApiError(404, "Room not found");

      await tx.joinRequest.update({
        where: { id: requestId },
        data: { status: "APPROVED" },
      });

      const existingMember = await tx.roomMember.findUnique({
        where: { userId_roomId: { userId: request.userId, roomId } },
      });

      if (!existingMember) {
        // 🔥 CONCURRENCY FIX: CONC-1 (Race Condition)
        // Atomic increment with capacity check (100 members max)
        await tx.room.update({
          where: { id: roomId, memberCount: { lt: 100 } },
          data: { memberCount: { increment: 1 } },
        }).catch(err => {
          if (err.code === 'P2025') throw new ApiError(400, "Room is full");
          throw err;
        });

        await tx.roomMember.create({
          data: { userId: request.userId, roomId, role: "MEMBER" },
        });
      }

      return { message: "Request approved", userId: request.userId };
    });
    await pubsub.publish({
      type: "room:event",
      roomId,
      payload: {
        type: "JOIN_REQUEST_APPROVED",
        requestId,
        userId: result.userId,
      },
    });
    return { message: result.message };
  }

  async rejectJoinRequest(
    roomId: string,
    requestId: string,
    adminUserId: string,
  ) {
    const adminMembership = await prisma.roomMember.findUnique({
      where: { userId_roomId: { userId: adminUserId, roomId } },
    });
    if (!adminMembership || adminMembership.role !== "ADMIN")
      throw new ApiError(403, "Access denied");

    const pending = await prisma.joinRequest.findUnique({
      where: { id: requestId },
    });
    if (!pending || pending.roomId !== roomId)
      throw new ApiError(404, "Request not found");

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
          include: { user: { select: { id: true, email: true, avatarUrl: true } } },
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

  async listMembers(roomId: string, userId: string) {
    // Check if user is a member or if the room is public
    const room = await prisma.room.findUnique({
      where: { id: roomId },
      select: { visibility: true, members: { select: { userId: true } } }
    });
    if (!room) throw new ApiError(404, "Room not found");

    const isMember = room.members.some(m => m.userId === userId);
    if (room.visibility === "PRIVATE" && !isMember) {
      throw new ApiError(403, "Access denied");
    }

    return prisma.roomMember.findMany({
      where: { roomId },
      include: {
        user: { select: { id: true, email: true, avatarUrl: true } }
      },
      orderBy: { role: "asc" }
    });
  }

  async removeMember(roomId: string, memberUserId: string, adminUserId: string) {
    const admin = await prisma.roomMember.findUnique({
      where: { userId_roomId: { userId: adminUserId, roomId } }
    });
    if (!admin || admin.role !== "ADMIN") throw new ApiError(403, "Only admins can remove members");

    if (memberUserId === adminUserId) throw new ApiError(400, "Cannot remove yourself. Use leave instead.");

    await prisma.$transaction([
      prisma.roomMember.delete({ where: { userId_roomId: { userId: memberUserId, roomId } } }),
      prisma.room.update({
        where: { id: roomId },
        data: { memberCount: { decrement: 1 } }
      })
    ]);

    return { message: "Member removed" };
  }

  async updateMemberRole(roomId: string, memberUserId: string, role: "ADMIN" | "MEMBER", adminUserId: string) {
    const admin = await prisma.roomMember.findUnique({
      where: { userId_roomId: { userId: adminUserId, roomId } }
    });
    if (!admin || admin.role !== "ADMIN") throw new ApiError(403, "Only admins can update roles");

    return prisma.roomMember.update({
      where: { userId_roomId: { userId: memberUserId, roomId } },
      data: { role }
    });
  }
}

export const roomService = new RoomService();
