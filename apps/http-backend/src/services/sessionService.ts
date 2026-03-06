import { signRefreshToken } from "@repo/auth";
import crypto from "crypto";
import { prisma } from "@repo/db";
import { Request } from "express";

export const createSession = async (userId: string, req: Request) => {
  const refreshToken = signRefreshToken();

  const tokenHash = crypto
    .createHash("sha256")
    .update(refreshToken)
    .digest("hex");

  await prisma.refreshToken.create({
    data: {
      tokenHash,
      userId,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    },
  });

  return refreshToken;
};
