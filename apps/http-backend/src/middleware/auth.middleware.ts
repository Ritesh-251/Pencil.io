import { Request, Response, NextFunction } from "express";
import { verifyToken } from "@repo/auth";
import { prisma } from "@repo/db";

export interface AuthRequest extends Request {
  userId?: string;
  userEmail?: string;
}

export async function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const accessTokenSecret = process.env.ACCESS_TOKEN_SECRET;
    if (!accessTokenSecret) {
      return res.status(500).json({ message: "Server misconfigured" });
    }

    const decoded = verifyToken(token, accessTokenSecret);

    const userId = typeof decoded === "string" ? undefined : decoded.sub;
    if (typeof userId !== "string") {
      return res.status(401).json({ message: "Invalid token" });
    }

    // Populate user info
    const user = await prisma.user.findUnique({ 
      where: { id: userId },
      select: { id: true, email: true }
    });

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    req.userId = user.id;
    req.userEmail = user.email;

    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid token" });
  }
}
