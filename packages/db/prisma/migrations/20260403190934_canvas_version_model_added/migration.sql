-- AlterTable
ALTER TABLE "CanvasActionHistory" ADD COLUMN     "eventId" TEXT,
ALTER COLUMN "objectId" DROP NOT NULL,
ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "RoomVersion" (
    "roomId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,

    CONSTRAINT "RoomVersion_pkey" PRIMARY KEY ("roomId")
);

-- CreateIndex
CREATE INDEX "CanvasActionHistory_roomId_userId_undoneAtVersion_idx" ON "CanvasActionHistory"("roomId", "userId", "undoneAtVersion");

-- CreateIndex
CREATE INDEX "CanvasActionHistory_eventId_idx" ON "CanvasActionHistory"("eventId");

-- CreateIndex
CREATE INDEX "CanvasObject_roomId_version_idx" ON "CanvasObject"("roomId", "version");
