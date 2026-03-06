import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware"
import { createRoom,joinRoom,leaveRoom,getRooms,DeleteRoom } from "../controller/room.controller";


const router: Router = Router();

router.post("/", authMiddleware, createRoom)

router.post("/:roomId/join", authMiddleware, joinRoom)

router.post("/:roomId/leave", authMiddleware, leaveRoom)

router.delete("/rooms/:roomId",authMiddleware,DeleteRoom)
router.get("/", authMiddleware, getRooms);

export default router;