import { Request, Response } from "express";
import { signAccessToken } from "@repo/auth";
import { createSession } from "../services/sessionService";

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

export const oauthCallbackHandler = async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    if (!user) {
      return res.redirect(`${FRONTEND_URL}/auth/signin?error=oauth_failed`);
    }

    const accessToken = signAccessToken(user.id);
    const refreshToken = await createSession(user.id, req);

    // Set refresh token in HttpOnly cookie
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: (process.env.NODE_ENV === "production" ? "none" : "lax") as "none" | "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000,
      domain: process.env.COOKIE_DOMAIN || undefined,
    });

    res.cookie("has_session", "true", {
      secure: process.env.NODE_ENV === "production",
      sameSite: (process.env.NODE_ENV === "production" ? "none" : "lax") as "none" | "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000,
      httpOnly: false,
      domain: process.env.COOKIE_DOMAIN || undefined,
    });

    // Redirect to a frontend route that will capture the access token
    // We pass the access token in a temporary way (e.g. hash or short-lived redirect)
    // For simplicity and security, we can use a "bridge" page on the frontend
    return res.redirect(`${FRONTEND_URL}/auth/callback?token=${accessToken}`);
  } catch (error) {
    console.error("OAuth callback error:", error);
    return res.redirect(`${FRONTEND_URL}/auth/signin?error=server_error`);
  }
};
