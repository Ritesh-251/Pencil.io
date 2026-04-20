ALTER TABLE "CanvasActionHistory"
ADD COLUMN IF NOT EXISTS "isRedoInvalidated" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "CanvasActionHistory_roomId_userId_isUndone_isRedoInvalidated_idx"
ON "CanvasActionHistory"("roomId", "userId", "isUndone", "isRedoInvalidated");
