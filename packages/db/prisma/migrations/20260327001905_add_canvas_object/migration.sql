-- CreateTable
CREATE TABLE "CanvasObject" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "version" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CanvasObject_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CanvasObject_roomId_createdAt_idx" ON "CanvasObject"("roomId", "createdAt");
