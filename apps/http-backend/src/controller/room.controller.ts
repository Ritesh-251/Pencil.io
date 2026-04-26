import { ApiError } from "../utils/ApiError";
import { AuthRequest } from "../middleware/auth.middleware";
import { Response } from "express";
import { createRoomSchema, updateRoomNameSchema } from "@repo/validation";
import { roomService } from "../services/room.service";

export const createRoom = async (req: AuthRequest, res: Response) => {
  try {
    const parsed = createRoomSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Validation error" });

    const room = await roomService.createRoom(req.userId!, parsed.data.name as string, (parsed.data.visibility as any) ?? "PUBLIC");
    return res.status(201).json({ room });
  } catch (error: any) {
    const status = error instanceof ApiError ? error.statusCode : 500;
    return res.status(status).json({ message: error.message || "Internal server error" });
  }
};

export const joinRoom = async (req: AuthRequest, res: Response) => {
  try {
    const roomId = String(req.params.roomId || "");
    if (!roomId) throw new ApiError(400, "Room ID required");
    const result = await roomService.joinRoom(req.userId!, roomId);
    return res.status(200).json(result);
  } catch (error: any) {
    const status = error instanceof ApiError ? error.statusCode : 500;
    return res.status(status).json({ message: error.message || "Internal server error" });
  }
};

export const leaveRoom = async (req: AuthRequest, res: Response) => {
  try {
    const roomId = String(req.params.roomId || "");
    if (!roomId) throw new ApiError(400, "Room ID required");
    const result = await roomService.leaveRoom(req.userId!, roomId);
    return res.status(200).json(result);
  } catch (error: any) {
    const status = error instanceof ApiError ? error.statusCode : 500;
    return res.status(status).json({ message: error.message || "Internal server error" });
  }
};

export const deleteRoom = async (req: AuthRequest, res: Response) => {
  try {
    const roomId = String(req.params.roomId || "");
    if (!roomId) throw new ApiError(400, "Room ID required");
    const result = await roomService.deleteRoom(req.userId!, roomId);
    return res.status(200).json(result);
  } catch (error: any) {
    const status = error instanceof ApiError ? error.statusCode : 500;
    return res.status(status).json({ message: error.message || "Internal server error" });
  }
};

export const getRooms = async (req: AuthRequest, res: Response) => {
  try {
    const rooms = await roomService.listUserRooms(req.userId!);
    return res.status(200).json({ rooms });
  } catch (error: any) {
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const updateRoomName = async (req: AuthRequest, res: Response) => {
  try {
    const roomId = String(req.params.roomId || "");
    const name = String(req.body?.name || "");
    if (!roomId || !name) return res.status(400).json({ message: "Invalid parameters" });

    const room = await roomService.updateRoomName(req.userId!, roomId, name);
    return res.status(200).json({ room });
  } catch (error: any) {
    const status = error instanceof ApiError ? error.statusCode : 403;
    return res.status(status).json({ message: error.message || "Internal server error" });
  }
};

export const getJoinRequests = async (req: AuthRequest, res: Response) => {
  try {
    const roomId = String(req.params.roomId || "");
    const requests = await roomService.getJoinRequests(roomId, req.userId!);
    return res.status(200).json({ requests });
  } catch (error: any) {
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const approveJoinRequest = async (req: AuthRequest, res: Response) => {
  try {
    const roomId = String(req.params.roomId || "");
    const requestId = String(req.params.requestId || "");
    const result = await roomService.approveJoinRequest(roomId, requestId, req.userId!);
    return res.status(200).json(result);
  } catch (error: any) {
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const rejectJoinRequest = async (req: AuthRequest, res: Response) => {
  try {
    const roomId = String(req.params.roomId || "");
    const requestId = String(req.params.requestId || "");
    const result = await roomService.rejectJoinRequest(roomId, requestId, req.userId!);
    return res.status(200).json(result);
  } catch (error: any) {
    return res.status(500).json({ message: "Internal server error" });
  }
};

// Aliases for route backward compatibility
export const DeleteRoom = deleteRoom;
