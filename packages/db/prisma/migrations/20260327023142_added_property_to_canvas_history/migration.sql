/*
  Warnings:

  - You are about to drop the column `data` on the `CanvasActionHistory` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "CanvasActionHistory" DROP COLUMN "data",
ADD COLUMN     "after" JSONB,
ADD COLUMN     "before" JSONB;
