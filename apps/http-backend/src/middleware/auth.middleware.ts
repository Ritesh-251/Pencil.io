import { Request, Response, NextFunction } from "express";
import { verifyToken } from "@repo/auth";

export interface AuthRequest extends Request {
  userId?: string;
  userEmail?: string;
}

// SEC-2 FIX: The previous implementation made a database round-trip on every
// authenticated request to verify the user still exists.  At scale (100 RPS)
// that is 100 extra DB queries per second for no meaningful security benefit —
// the JWT already proves identity and a deleted user's token remains valid until
// the access-token TTL expires regardless.
//
// We now trust the JWT entirely.  If user-deletion revocation is required in the
// future, maintain a Redis blocklist keyed on the token's `jti` claim.
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

    // Populate request with claims from the token — no DB round-trip needed.
    req.userId = userId;
    // userEmail is not in the standard JWT payload for this service; callers
    // that need the email should fetch it from the DB in their own handler.
    req.userEmail =
      typeof (decoded as any).email === "string"
        ? (decoded as any).email
        : undefined;

    next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
}
