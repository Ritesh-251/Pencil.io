import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaShutdownRegistered?: boolean;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    // Q-7 FIX: "query" logging in production creates enormous log volumes and
    // can leak PII (email addresses and user IDs appear in WHERE clauses).
    // Only enable verbose logging in development.
    log:
      process.env.NODE_ENV === "production"
        ? ["error"]
        : ["query", "warn", "error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

if (
  process.env.NODE_ENV !== "test" &&
  !globalForPrisma.prismaShutdownRegistered
) {
  globalForPrisma.prismaShutdownRegistered = true;
  const shutdown = async () => {
    await prisma.$disconnect().catch(() => {});
  };

  process.once("SIGTERM", () => {
    void shutdown();
  });
  process.once("SIGINT", () => {
    void shutdown();
  });
}
