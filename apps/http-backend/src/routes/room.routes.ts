import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import {
  createRoom,
  joinRoom,
  leaveRoom,
  getRooms,
  DeleteRoom,
  updateRoomName,
} from "../controller/room.controller";

const router: Router = Router();

router.post("/", authMiddleware, createRoom);

router.post("/:roomId/join", authMiddleware, joinRoom);

router.post("/:roomId/leave", authMiddleware, leaveRoom);

router.patch("/:roomId", authMiddleware, updateRoomName);

router.delete("/:roomId", authMiddleware, DeleteRoom);
router.get("/", authMiddleware, getRooms);

export default router;
