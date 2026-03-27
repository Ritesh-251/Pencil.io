-- CreateTable
CREATE TABLE "CanvasSnapshot" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "version" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CanvasSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CanvasSnapshot_roomId_version_idx" ON "CanvasSnapshot"("roomId", "version");
