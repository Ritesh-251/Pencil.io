CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS "TranscriptSegment" (
  "id" TEXT NOT NULL,
  "roomId" TEXT NOT NULL,
  "participantIdentity" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "startMs" INTEGER NOT NULL,
  "endMs" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TranscriptSegment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TranscriptSegment_roomId_startMs_idx"
  ON "TranscriptSegment"("roomId", "startMs");

CREATE INDEX IF NOT EXISTS "TranscriptSegment_roomId_createdAt_idx"
  ON "TranscriptSegment"("roomId", "createdAt");

CREATE TABLE IF NOT EXISTS "SessionChunk" (
  "id" TEXT NOT NULL,
  "roomId" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "embedding" vector(1536),
  "startMs" INTEGER NOT NULL,
  "endMs" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SessionChunk_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SessionChunk_roomId_idx"
  ON "SessionChunk"("roomId");

CREATE INDEX IF NOT EXISTS "SessionChunk_roomId_startMs_idx"
  ON "SessionChunk"("roomId", "startMs");

CREATE TABLE IF NOT EXISTS "SessionSummary" (
  "id" TEXT NOT NULL,
  "roomId" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SessionSummary_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SessionSummary_roomId_key"
  ON "SessionSummary"("roomId");
