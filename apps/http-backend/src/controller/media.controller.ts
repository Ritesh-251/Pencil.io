import { joinRoomSchema } from "@repo/validation";
import { Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware";
import { ApiError } from "../utils/ApiError";
import { createMediaToken } from "../services/mediaToken.service";

export async function issueRoomMediaToken(req: AuthRequest, res: Response) {
  try {
    const parsed = joinRoomSchema.safeParse(req.params);
    if (!parsed.success) {
      return res.status(400).json({
        message: parsed.error.issues[0]?.message ?? "Validation error",
      });
    }

    const userId = req.userId;
    if (!userId) {
      throw new ApiError(401, "Unauthorized");
    }

    const session = await createMediaToken({
      roomId: parsed.data.roomId,
      userId,
    });

    return res.status(200).json(session);
  } catch (error) {
    if (error instanceof ApiError) {
      return res.status(error.statusCode).json({
        message: error.message,
      });
    }

    console.error(error);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
}
