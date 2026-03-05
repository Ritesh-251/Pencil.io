import * as jwt from "jsonwebtoken"

export function signAccessToken(userId: string) {
  return jwt.sign(
    { sub: userId },
    process.env.ACCESS_TOKEN_SECRET!,
    { expiresIn: "15m" }
  )
}