import * as bcrypt from "bcrypt";

const SALT_ROUNDS = 10;

export async function hashPassword(password: string) {
  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
  return hashedPassword;
}
