import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import {
  createRoom,
  joinRoom,
  leaveRoom,
  getRooms,
  DeleteRoom,
  updateRoomName,
  getJoinRequests,
  approveJoinRequest,
  rejectJoinRequest,
} from "../controller/room.controller";
import {
  issueRoomMediaToken,
  startTranscription,
  stopTranscription,
} from "../controller/media.controller";

const router: Router = Router();

router.post("/", authMiddleware, createRoom);

router.post("/:roomId/join", authMiddleware, joinRoom);
router.get("/:roomId/join-requests", authMiddleware, getJoinRequests);
router.post(
  "/:roomId/join-requests/:requestId/approve",
  authMiddleware,
  approveJoinRequest,
);
router.post(
  "/:roomId/join-requests/:requestId/reject",
  authMiddleware,
  rejectJoinRequest,
);
router.post("/:roomId/media/token", authMiddleware, issueRoomMediaToken);
router.post("/:roomId/transcribe", authMiddleware, startTranscription);
router.post("/:roomId/transcribe/stop", authMiddleware, stopTranscription);

router.post("/:roomId/leave", authMiddleware, leaveRoom);

router.patch("/:roomId", authMiddleware, updateRoomName);

router.delete("/:roomId", authMiddleware, DeleteRoom);
router.get("/", authMiddleware, getRooms);

export default router;
