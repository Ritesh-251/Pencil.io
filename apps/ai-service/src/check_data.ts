import dotenv from "dotenv";
dotenv.config();
import { prisma } from "@repo/db";

async function checkData() {
  try {
    const transcriptCount = await prisma.transcriptSegment.count();
    const chunkCount = await prisma.sessionChunk.count();
    const summaryCount = await prisma.sessionSummary.count();
    
    console.log(JSON.stringify({
      transcriptCount,
      chunkCount,
      summaryCount
    }, null, 2));
    
    const latestTranscript = await prisma.transcriptSegment.findFirst({
      orderBy: { createdAt: 'desc' }
    });
    console.log("Latest Transcript:", JSON.stringify(latestTranscript, null, 2));
    
  } catch (error) {
    console.error("Error checking data:", error);
  } finally {
    await prisma.$disconnect();
  }
}

void checkData();
