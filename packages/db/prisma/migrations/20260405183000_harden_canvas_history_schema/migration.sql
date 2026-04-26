-- Normalize and harden CanvasActionHistory semantics for deterministic replay.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CanvasActionType') THEN
    CREATE TYPE "CanvasActionType" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'UNDO', 'REDO');
  END IF;
END $$;

-- Backfill actionType to new enum-compatible values.
UPDATE "CanvasActionHistory"
SET "actionType" = (
  CASE
    WHEN "actionType"::text IN ('CREATE_OBJECT', 'CREATE') THEN 'CREATE'
    WHEN "actionType"::text IN ('UPDATE_OBJECT', 'UPDATE') THEN 'UPDATE'
    WHEN "actionType"::text IN ('DELETE_OBJECT', 'DELETE') THEN 'DELETE'
    WHEN "actionType"::text = 'UNDO' THEN 'UNDO'
    WHEN "actionType"::text = 'REDO' THEN 'REDO'
    ELSE 'UPDATE'
  END
)::"CanvasActionType"
WHERE "actionType" IS NOT NULL;

-- Enforce patch shape and required fields for replay safety.
UPDATE "CanvasActionHistory"
SET "before" = COALESCE("before", '{}'::jsonb);

UPDATE "CanvasActionHistory"
SET "after" =
  CASE
    WHEN "after" IS NULL THEN jsonb_build_object('props', '{}'::jsonb)
    WHEN jsonb_typeof("after") = 'object' AND ("after" ? 'props') THEN "after"
    ELSE jsonb_build_object('props', "after")
  END;

UPDATE "CanvasActionHistory"
SET "objectId" = COALESCE("objectId", 'legacy-' || "id");

UPDATE "CanvasActionHistory"
SET "eventId" = COALESCE("eventId", 'legacy-' || "id");

-- Ensure eventId uniqueness before adding @unique constraint.
WITH ranked AS (
  SELECT "id", "eventId", ROW_NUMBER() OVER (PARTITION BY "eventId" ORDER BY "createdAt", "id") AS rn
  FROM "CanvasActionHistory"
)
UPDATE "CanvasActionHistory" h
SET "eventId" = h."eventId" || '-dup-' || h."id"
FROM ranked r
WHERE h."id" = r."id" AND r.rn > 1;

-- Convert actionType from TEXT to enum.
ALTER TABLE "CanvasActionHistory"
ALTER COLUMN "actionType" TYPE "CanvasActionType"
USING ("actionType"::"CanvasActionType");

-- Enforce non-null required columns.
ALTER TABLE "CanvasActionHistory"
ALTER COLUMN "objectId" SET NOT NULL,
ALTER COLUMN "before" SET NOT NULL,
ALTER COLUMN "after" SET NOT NULL,
ALTER COLUMN "eventId" SET NOT NULL;

-- Constraint and index hardening.
CREATE UNIQUE INDEX IF NOT EXISTS "CanvasActionHistory_eventId_key" ON "CanvasActionHistory"("eventId");
DROP INDEX IF EXISTS "CanvasActionHistory_eventId_idx";
CREATE INDEX IF NOT EXISTS "CanvasActionHistory_objectId_version_idx" ON "CanvasActionHistory"("objectId", "version");
CREATE INDEX IF NOT EXISTS "CanvasActionHistory_roomId_createdAt_idx" ON "CanvasActionHistory"("roomId", "createdAt");

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'RoomVersion') THEN
    CREATE INDEX IF NOT EXISTS "RoomVersion_roomId_idx" ON "RoomVersion"("roomId");
  END IF;
END $$;

-- Hot path for filtering active objects.
CREATE INDEX IF NOT EXISTS "idx_canvas_not_deleted"
ON "CanvasObject"("roomId")
WHERE ("crdt"->'props'->>'deleted') IS NULL;
