import { prisma } from "@repo/db";
import {
  signAccessToken,
  comparePassword,
  hashPassword,
  signRefreshToken,
} from "@repo/auth";
import crypto from "crypto";
import { createSession } from "./sessionService";
import { ApiError } from "../utils/ApiError";
import { getChannel } from "../infra/rabbitmq";
import { logger } from "../infra/logger";

export class AuthService {
  private publishEmailTask(type: string, payload: any) {
    try {
      const channel = getChannel();
      const content = Buffer.from(JSON.stringify({ type, payload }));
      channel.publish("events.exchange", "email.task", content, {
        persistent: true,
      });
    } catch (error) {
      logger.error({ error }, "Failed to publish email task");
    }
  }

  async signup(email: string, password: string, req: any) {
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) throw new ApiError(409, "User already exists");

    const hashedPassword = await hashPassword(password);
    const verificationToken = crypto.randomBytes(32).toString("hex");

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        verificationToken,
        isVerified: false,
      },
    });

    this.publishEmailTask("VERIFY_EMAIL", { email, token: verificationToken });

    const accessToken = signAccessToken(user.id);
    const refreshToken = await createSession(user.id, req);

    return {
      userId: user.id,
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        isVerified: user.isVerified,
        avatarUrl: user.avatarUrl,
      },
    };
  }

  async verifyEmail(token: string) {
    const user = await prisma.user.findFirst({
      where: { verificationToken: token },
    });
    if (!user) throw new ApiError(400, "Invalid or expired verification token");

    await prisma.user.update({
      where: { id: user.id },
      data: { isVerified: true, verificationToken: null },
    });

    return { message: "Email verified successfully" };
  }

  async resendVerification(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new ApiError(404, "User not found");
    if (user.isVerified) throw new ApiError(400, "Email is already verified");

    const verificationToken = crypto.randomBytes(32).toString("hex");
    await prisma.user.update({
      where: { id: userId },
      data: { verificationToken },
    });

    this.publishEmailTask("VERIFY_EMAIL", {
      email: user.email,
      token: verificationToken,
    });

    return { message: "Verification email resent" };
  }

  async signin(email: string, password: string, req: any) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new ApiError(401, "Invalid email or password");

    if (!user.password) {
      throw new ApiError(
        401,
        "This account uses social login. Please sign in with Google or GitHub.",
      );
    }

    const isPasswordValid = await comparePassword(password, user.password);
    if (!isPasswordValid) throw new ApiError(401, "Invalid email or password");

    const accessToken = signAccessToken(user.id);
    const refreshToken = await createSession(user.id, req);

    return {
      userId: user.id,
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        isVerified: user.isVerified,
        avatarUrl: user.avatarUrl,
      },
    };
  }

  async upsertOAuthUser(profile: {
    email: string;
    provider: "google" | "github";
    providerId: string;
    avatarUrl?: string;
  }) {
    let user = await prisma.user.findUnique({ where: { email: profile.email } });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: profile.email,
          isVerified: true,
          avatarUrl: profile.avatarUrl,
          [profile.provider === "google" ? "googleId" : "githubId"]:
            profile.providerId,
        },
      });
    } else {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          [profile.provider === "google" ? "googleId" : "githubId"]:
            profile.providerId,
          avatarUrl: user.avatarUrl || profile.avatarUrl,
          isVerified: true,
        },
      });
    }
    return user;
  }

  async getOrCreateTesterUser(req: any) {
    let user = await prisma.user.findUnique({
      where: { email: "tester@pencil.io" },
    });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: "tester@pencil.io",
          isVerified: true,
        },
      });
    }

    const accessToken = signAccessToken(user.id);
    const refreshToken = await createSession(user.id, req);

    return {
      userId: user.id,
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        isVerified: true,
        avatarUrl: user.avatarUrl,
      },
    };
  }

  async refreshAccessToken(refreshToken: string, req: any) {
    const tokenHash = crypto
      .createHash("sha256")
      .update(refreshToken)
      .digest("hex");
    const session = await prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (!session || session.expiresAt < new Date()) {
      if (session)
        await prisma.refreshToken.deleteMany({ where: { tokenHash } });
      throw new ApiError(401, "Session expired or invalid");
    }

    const newRefreshToken = signRefreshToken();
    const newTokenHash = crypto
      .createHash("sha256")
      .update(newRefreshToken)
      .digest("hex");

    await prisma.refreshToken.update({
      where: { tokenHash },
      data: {
        tokenHash: newTokenHash,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        lastUsedAt: new Date(),
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      },
    });

    const accessToken = signAccessToken(session.userId);

    return { accessToken, refreshToken: newRefreshToken };
  }

  async logout(refreshToken: string) {
    const tokenHash = crypto
      .createHash("sha256")
      .update(refreshToken)
      .digest("hex");
    await prisma.refreshToken.deleteMany({ where: { tokenHash } });
  }

  async logoutAll(userId: string) {
    await prisma.refreshToken.deleteMany({ where: { userId } });
  }

  async listSessions(userId: string) {
    return prisma.refreshToken.findMany({
      where: { userId },
      select: {
        id: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
        expiresAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async deleteSession(userId: string, sessionId: string) {
    const session = await prisma.refreshToken.findFirst({
      where: { id: sessionId, userId },
    });
    if (!session) throw new ApiError(404, "Session not found");
    await prisma.refreshToken.delete({ where: { id: sessionId } });
  }

  async getProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        isVerified: true,
        avatarUrl: true,
        name: true,
        bio: true,
        createdAt: true,
      },
    });
    if (!user) throw new ApiError(404, "User not found");
    return user;
  }

  async updateProfile(userId: string, data: { name?: string; bio?: string; avatarUrl?: string }) {
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        name: data.name,
        bio: data.bio,
        avatarUrl: data.avatarUrl,
      },
      select: {
        id: true,
        email: true,
        isVerified: true,
        avatarUrl: true,
        name: true,
        bio: true,
      }
    });
    return user;
  }

  async searchUsers(query: string, excludeUserId: string) {
    if (!query || query.length < 2) return [];
    
    logger.info({ query, userId: excludeUserId }, "Searching users");

    // Optimization: If it looks like a prefix, startsWith is faster. 
    // Otherwise contains is needed for middle-of-email search.
    return prisma.user.findMany({
      where: {
        email: { contains: query, mode: "insensitive" },
        id: { not: excludeUserId }
      },
      select: {
        id: true,
        email: true,
        avatarUrl: true
      },
      take: 10
    });
  }
}

export const authService = new AuthService();
