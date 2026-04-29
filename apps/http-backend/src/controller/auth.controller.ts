import { Request, Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware";
import { ApiError } from "../utils/ApiError";
import { signupSchema, signinSchema } from "@repo/validation";
import { authService } from "../services/auth.service";
import { logger } from "../infra/logger";

const REFRESH_TOKEN_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  maxAge: 30 * 24 * 60 * 60 * 1000,
};

function setRefreshTokenCookie(res: Response, token: string) {
  res.cookie("refreshToken", token, REFRESH_TOKEN_COOKIE_OPTIONS);
}

export const signup = async (req: Request, res: Response) => {
  try {
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({
          message: parsed.error.issues[0]?.message ?? "Validation error",
        });
    }

    const { email, password } = parsed.data;
    const { userId, accessToken, refreshToken } = await authService.signup(
      email,
      password,
      req,
    );

    setRefreshTokenCookie(res, refreshToken);
    return res
      .status(201)
      .json({ message: "User signed up successfully", userId, accessToken });
  } catch (error: any) {
    logger.error(
      { err: error.message, email: req.body?.email },
      "signup failed",
    );
    const status = error instanceof ApiError ? error.statusCode : 500;
    return res
      .status(status)
      .json({ message: error.message || "Internal server error" });
  }
};

export const signin = async (req: Request, res: Response) => {
  try {
    const parsed = signinSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({
          message: parsed.error.issues[0]?.message ?? "Validation error",
        });
    }

    const { email, password } = parsed.data;
    const { userId, accessToken, refreshToken } = await authService.signin(
      email,
      password,
      req,
    );

    setRefreshTokenCookie(res, refreshToken);
    return res.status(200).json({ userId, accessToken });
  } catch (error: any) {
    logger.error(
      { err: error.message, email: req.body?.email },
      "signin failed",
    );
    const status = error instanceof ApiError ? error.statusCode : 500;
    return res
      .status(status)
      .json({ message: error.message || "Internal server error" });
  }
};

export const verifyEmail = async (req: Request, res: Response) => {
  try {
    const token = String(req.query.token || "");
    if (!token) throw new ApiError(400, "Token is required");

    const result = await authService.verifyEmail(token);
    return res.status(200).json(result);
  } catch (error: any) {
    const status = error instanceof ApiError ? error.statusCode : 500;
    return res
      .status(status)
      .json({ message: error.message || "Internal server error" });
  }
};

export const resendVerification = async (req: AuthRequest, res: Response) => {
  try {
    const result = await authService.resendVerification(req.userId!);
    return res.status(200).json(result);
  } catch (error: any) {
    const status = error instanceof ApiError ? error.statusCode : 500;
    return res
      .status(status)
      .json({ message: error.message || "Internal server error" });
  }
};

export const generateAccessToken = async (req: Request, res: Response) => {
  try {
    const refreshToken = String(req.cookies.refreshToken || "");
    if (!refreshToken) throw new ApiError(401, "Unauthorized");

    const result = await authService.refreshAccessToken(refreshToken, req);
    setRefreshTokenCookie(res, result.refreshToken);
    return res.status(200).json({ accessToken: result.accessToken });
  } catch (error: any) {
    const status = error instanceof ApiError ? error.statusCode : 500;
    return res
      .status(status)
      .json({ message: error.message || "Internal server error" });
  }
};

export const sessions = async (req: AuthRequest, res: Response) => {
  try {
    const data = await authService.listSessions(req.userId!);
    return res.status(200).json({ sessions: data });
  } catch (error: any) {
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const deleteSession = async (req: AuthRequest, res: Response) => {
  try {
    const sessionId = String(req.params.sessionId || "");
    await authService.deleteSession(req.userId!, sessionId);
    return res.status(200).json({ message: "Session revoked successfully" });
  } catch (error: any) {
    const status = error instanceof ApiError ? error.statusCode : 404;
    return res
      .status(status)
      .json({ message: error.message || "Internal server error" });
  }
};

export const logout = async (req: Request, res: Response) => {
  try {
    const refreshToken = String(req.cookies.refreshToken || "");
    if (refreshToken) await authService.logout(refreshToken);
    res.clearCookie("refreshToken");
    return res.status(200).json({ message: "Logged out successfully" });
  } catch (error: any) {
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const logoutAll = async (req: AuthRequest, res: Response) => {
  try {
    await authService.logoutAll(req.userId!);
    res.clearCookie("refreshToken");
    return res.status(200).json({ message: "Logged out from all devices" });
  } catch (error: any) {
    return res.status(500).json({ message: "Internal server error" });
  }
};
