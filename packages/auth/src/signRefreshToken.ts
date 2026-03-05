import * as crypto from "crypto";

export function signRefreshToken() {
  return crypto.randomBytes(40).toString("hex");
}
