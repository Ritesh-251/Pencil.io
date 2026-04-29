import dotenv from "dotenv";
dotenv.config();
import { prisma } from "@repo/db";
import { logger } from "./infra/logger";

async function checkData() {
  try {
    const transcriptCount = await prisma.transcriptSegment.count();
    const chunkCount = await prisma.sessionChunk.count();
    const summaryCount = await prisma.sessionSummary.count();

    logger.info(
      {
        transcriptCount,
        chunkCount,
        summaryCount,
      },
      "Database counts",
    );

    const latestTranscript = await prisma.transcriptSegment.findFirst({
      orderBy: { createdAt: "desc" },
    });
    logger.info({ latestTranscript }, "Latest Transcript");
  } catch (error) {
    logger.error({ error }, "Error checking data");
  } finally {
    await prisma.$disconnect();
  }
}

void checkData();
