import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import {
  createTask,
  getMyTasks,
  updateTask,
  deleteTask,
} from "../controller/task.controller";

const router: Router = Router();

router.use(authMiddleware);

router.post("/", createTask);
router.get("/", getMyTasks);
router.patch("/:id", updateTask);
router.delete("/:id", deleteTask);

export default router;
