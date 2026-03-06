import { Router } from "express";
import { signin,signup,deleteSession,sessions,logout,logoutAll, generateAccessToken } from "../controller/auth.controller";
import { authMiddleware } from "../middleware/auth.middleware";

const router:Router = Router();


router.post("/signup",signup);
router.post("/signin",signin);
router.post("/refresh",generateAccessToken);
router.post("/logout", logout);
router.post("logout-all",logoutAll);
router.get("/sessions",authMiddleware,sessions);
router.delete("/sessions/:sessionId", authMiddleware, deleteSession);

export default router;