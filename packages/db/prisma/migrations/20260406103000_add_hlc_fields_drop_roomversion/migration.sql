ALTER TABLE "CanvasObject"
ADD COLUMN IF NOT EXISTS "time" BIGINT,
ADD COLUMN IF NOT EXISTS "actorId" TEXT;

ALTER TABLE "CanvasActionHistory"
ADD COLUMN IF NOT EXISTS "time" BIGINT,
ADD COLUMN IF NOT EXISTS "actorId" TEXT;

UPDATE "CanvasObject"
SET
  "time" = COALESCE("time", "version"::BIGINT),
  "actorId" = COALESCE("actorId", "userId")
WHERE "time" IS NULL OR "actorId" IS NULL;

UPDATE "CanvasActionHistory"
SET
  "time" = COALESCE("time", "version"::BIGINT),
  "actorId" = COALESCE("actorId", "userId")
WHERE "time" IS NULL OR "actorId" IS NULL;

CREATE INDEX IF NOT EXISTS "CanvasObject_roomId_time_actorId_idx"
ON "CanvasObject"("roomId", "time", "actorId");

CREATE INDEX IF NOT EXISTS "CanvasActionHistory_objectId_time_actorId_idx"
ON "CanvasActionHistory"("objectId", "time", "actorId");

CREATE INDEX IF NOT EXISTS "CanvasActionHistory_roomId_time_actorId_idx"
ON "CanvasActionHistory"("roomId", "time", "actorId");

DROP TABLE IF EXISTS "RoomVersion";
