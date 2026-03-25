import express from "express";

const app: express.Application = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true, limit: "16kb" }));

import userRouter from "./routes/auth.routes";
import roomRouter from "./routes/room.routes";
import messageRouter from "./routes/message.routes";
import adminRouter from "./routes/admin.routes";
app.use("/api/v1/users", userRouter);
app.use("/api/v1/rooms", roomRouter);
app.use("/api/v1/rooms", messageRouter);
app.use("/api/v1/rooms", adminRouter);
export { app };
