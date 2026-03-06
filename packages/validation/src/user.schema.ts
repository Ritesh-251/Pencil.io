import { z } from "zod";

export const signupSchema = z.object({
  email: z.email(),

  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72)
    .regex(/[A-Z]/, "Password must contain an uppercase letter")
    .regex(/[a-z]/, "Password must contain a lowercase letter")
    .regex(/[0-9]/, "Password must contain a number")
    .regex(/[^A-Za-z0-9]/, "Password must contain a special character"),
});

export const signinSchema = z.object({
  email: z.email(),
  password: z
    .string()
    .min(1, "Password is required")
    .max(72, "Password too long"),
});
