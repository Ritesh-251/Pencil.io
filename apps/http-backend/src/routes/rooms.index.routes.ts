import { Router } from "express";
import roomRouter from "./room.routes";
import messageRouter from "./message.routes";
import adminRouter from "./admin.routes";
import aiRouter from "./ai.routes";

const roomsRouter: Router = Router();

roomsRouter.use("/", roomRouter);
roomsRouter.use("/:roomId/ai", aiRouter);
roomsRouter.use("/", messageRouter);
roomsRouter.use("/", adminRouter);

export default roomsRouter;
