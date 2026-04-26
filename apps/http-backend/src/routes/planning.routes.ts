import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { scheduleMeeting, getMyMeetings, deleteMeeting } from "../controller/planning.controller";

const router: Router = Router();

// Apply auth to all functional planning routes
router.use(authMiddleware);

router.post("/", scheduleMeeting);
router.get("/", getMyMeetings);
router.delete("/:id", deleteMeeting);

export default router;
