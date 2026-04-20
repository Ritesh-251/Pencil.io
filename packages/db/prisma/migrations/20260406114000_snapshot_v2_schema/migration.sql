DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SnapshotType') THEN
    CREATE TYPE "SnapshotType" AS ENUM ('BASE', 'DELTA');
  END IF;
END $$;

ALTER TABLE "CanvasSnapshot"
ADD COLUMN IF NOT EXISTS "type" "SnapshotType" NOT NULL DEFAULT 'BASE',
ADD COLUMN IF NOT EXISTS "baseVersion" INTEGER;

CREATE INDEX IF NOT EXISTS "CanvasSnapshot_roomId_type_version_idx"
ON "CanvasSnapshot"("roomId", "type", "version");
