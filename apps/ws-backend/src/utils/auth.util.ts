import { verifyToken } from "@repo/auth";

export function getUserIdFromAuthHeader(
  authHeader: string | undefined,
): string | null {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) return null;

  const accessTokenSecret = process.env.ACCESS_TOKEN_SECRET;
  if (!accessTokenSecret) return null;

  try {
    const decoded = verifyToken(token, accessTokenSecret);
    const userId = typeof decoded === "string" ? undefined : decoded.sub;
    return typeof userId === "string" ? userId : null;
  } catch {
    return null;
  }
}
