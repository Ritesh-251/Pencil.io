import { prisma } from "@repo/db";
import { Request, Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware";
import { ApiError } from "../utils/ApiError";
import { signupSchema, signinSchema } from "@repo/validation";
import { signAccessToken, comparePassword, hashPassword } from "@repo/auth";
import crypto from "crypto";
import { createSession } from "../services/sessionService";

export const signup = async function (req: Request, res: Response) {
  try {
    const parsed = signupSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        message: parsed.error.issues[0]?.message ?? "Validation error",
      });
    }

    const { email, password } = parsed.data;

    const oldUser = await prisma.user.findUnique({
      where: { email },
    });
    if (oldUser) {
      throw new ApiError(409, "User already exist");
    }
    const hashpassword = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        email,
        password: hashpassword,
      },
    });
    const accessToken = signAccessToken(user.id);
    const refreshToken = await createSession(user.id, req);
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    return res.status(201).json({
      message: "User signed up successfully",
      userId: user.id,
      accessToken,
    });
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
};

export const signin = async function (req: Request, res: Response) {
  try {
    const parsed = signinSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: parsed.error.issues[0]?.message ?? "Validation error",
      });
    }
    const { email, password } = parsed.data;
    const user = await prisma.user.findUnique({
      where: {
        email,
      },
    });
    if (!user) {
      throw new ApiError(401, "Invalid email or password");
    }
    const isPasswordValid = await comparePassword(password, user.password);
    if (!isPasswordValid) {
      throw new ApiError(401, "Invalid email or password");
    }
    const accessToken = signAccessToken(user.id);
    const refreshToken = await createSession(user.id, req);
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    return res.status(200).json({
      userId: user.id,
      accessToken,
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return res.status(error.statusCode).json({
        message: error.message,
      });
    }

    console.log(error);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
};

export const generateAccessToken = async function (
  req: Request,
  res: Response,
) {
  try {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) {
      throw new ApiError(401, "Unauthorized");
    }
    const tokenHash = crypto
      .createHash("sha256")
      .update(refreshToken)
      .digest("hex");

    const session = await prisma.refreshToken.findUnique({
      where: { tokenHash },
    });
    if (!session) {
      throw new ApiError(401, "Invalid refresh token");
    }
    if (session.expiresAt < new Date()) {
      await prisma.refreshToken.delete({
        where: { tokenHash },
      });

      throw new ApiError(401, "Session expired. Please login again.");
    }
    await prisma.refreshToken.delete({
      where: { tokenHash },
    });
    const newRefreshToken = await createSession(session.userId, req);
    res.cookie("refreshToken", newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
    const accessToken = signAccessToken(session.userId);

    return res.status(200).json({ accessToken });
  } catch (error) {
    if (error instanceof ApiError) {
      return res.status(error.statusCode).json({
        message: error.message,
      });
    }
    console.log(error);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
};
export const sessions = async function (req: AuthRequest, res: Response) {
  try {
    const userId = req.userId;
    const sessions = await prisma.refreshToken.findMany({
      where: { userId },
      select: {
        id: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
        expiresAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });
    return res.status(200).json({
      sessions,
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return res.status(error.statusCode).json({
        message: error.message,
      });
    }
    console.log(error);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
};
export const deleteSession = async function (req: AuthRequest, res: Response) {
  try {
    const { sessionId } = req.params;
    const userId = req.userId;
    const session = await prisma.refreshToken.findFirst({
      where: {
        id: sessionId as string,
        userId,
      },
    });
    if (!session) {
      throw new ApiError(404, "Session not found");
    }
    await prisma.refreshToken.delete({
      where: {
        id: sessionId as string,
      },
    });

    return res.status(200).json({
      message: "Session revoked successfully",
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return res.status(error.statusCode).json({
        message: error.message,
      });
    }
    console.log(error);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
};
export const logout = async function (req: Request, res: Response) {
  try {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) {
      throw new ApiError(401, "Unauthorized");
    }
    const tokenHash = crypto
      .createHash("sha256")
      .update(refreshToken)
      .digest("hex");

    await prisma.refreshToken.deleteMany({
      where: { tokenHash },
    });
    res.clearCookie("refreshToken");

    return res.status(200).json({
      message: "Logged out successfully",
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return res.status(error.statusCode).json({
        message: error.message,
      });
    }
    console.log(error);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
};
export const logoutAll = async function (req: AuthRequest, res: Response) {
  try {
    const userId = req.userId;
    await prisma.refreshToken.deleteMany({
      where: { userId },
    });
    res.clearCookie("refreshToken");

    return res.status(200).json({
      message: "Logged out from all devices",
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return res.status(error.statusCode).json({
        message: error.message,
      });
    }
    console.log(error);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
};
