/*
  Warnings:

  - You are about to drop the column `action` on the `CanvasActionHistory` table. All the data in the column will be lost.
  - Added the required column `actionType` to the `CanvasActionHistory` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "CanvasActionHistory" DROP COLUMN "action",
ADD COLUMN     "actionType" TEXT NOT NULL,
ADD COLUMN     "isUndone" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "referenceActionId" TEXT,
ADD COLUMN     "undoneAtVersion" INTEGER;

-- CreateIndex
CREATE INDEX "CanvasActionHistory_roomId_version_idx" ON "CanvasActionHistory"("roomId", "version");

-- CreateIndex
CREATE INDEX "CanvasActionHistory_roomId_userId_isUndone_idx" ON "CanvasActionHistory"("roomId", "userId", "isUndone");
