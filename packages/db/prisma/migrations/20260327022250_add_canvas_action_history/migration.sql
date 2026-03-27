-- CreateTable
CREATE TABLE "CanvasActionHistory" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "objectId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "version" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CanvasActionHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CanvasActionHistory_roomId_userId_version_idx" ON "CanvasActionHistory"("roomId", "userId", "version");
