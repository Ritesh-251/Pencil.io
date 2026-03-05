import * as jwt from "jsonwebtoken";

export function verifyToken(token: string, secret: string) {
  return jwt.verify(token, secret);
}
