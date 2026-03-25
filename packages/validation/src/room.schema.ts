import { z } from "zod";

export const createRoomSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  visibility: z.enum(["PUBLIC", "PRIVATE"]).optional(),
});

export const joinRoomSchema = z.object({
  roomId: z.uuid(),
});

export const leaveRoomSchema = z.object({
  roomId: z.uuid(),
});

export const deleteRoomSchema = z.object({
  roomId: z.uuid(),
});
