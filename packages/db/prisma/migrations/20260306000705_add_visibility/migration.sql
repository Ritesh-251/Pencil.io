-- CreateEnum
CREATE TYPE "RoomVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "visibility" "RoomVisibility" NOT NULL DEFAULT 'PUBLIC';
