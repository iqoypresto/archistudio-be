-- Add SITE_MANAGER role (BR-06, BR-41, D-07)
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SITE_MANAGER';

-- Add nullable site_manager_id to projects (BR-41, D-01, K-03)
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "site_manager_id" TEXT;
CREATE INDEX IF NOT EXISTS "projects_site_manager_id_idx" ON "projects"("site_manager_id");
ALTER TABLE "projects"
  ADD CONSTRAINT "projects_site_manager_id_fkey"
  FOREIGN KEY ("site_manager_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Simplify Drawing to 1-way architecture design gallery without In/Out (BR-32)
DROP INDEX IF EXISTS "drawings_project_id_direction_archived_at_uploaded_at_idx";
ALTER TABLE "drawings" DROP COLUMN IF EXISTS "direction";
DROP TYPE IF EXISTS "DrawingDirection";
CREATE INDEX IF NOT EXISTS "drawings_project_id_archived_at_uploaded_at_idx"
  ON "drawings"("project_id", "archived_at", "uploaded_at");

-- Add audit trail (created_by_id, updated_by_id) to comms_entries for 4-role access (BR-35, D-05)
ALTER TABLE "comms_entries" ADD COLUMN IF NOT EXISTS "created_by_id" TEXT;
ALTER TABLE "comms_entries" ADD COLUMN IF NOT EXISTS "updated_by_id" TEXT;

UPDATE "comms_entries"
SET "created_by_id" = COALESCE(
  (SELECT "id" FROM "users" WHERE "role" = 'OWNER' ORDER BY "created_at" ASC LIMIT 1),
  (SELECT "id" FROM "users" ORDER BY "created_at" ASC LIMIT 1)
)
WHERE "created_by_id" IS NULL;

ALTER TABLE "comms_entries" ALTER COLUMN "created_by_id" SET NOT NULL;

ALTER TABLE "comms_entries"
  ADD CONSTRAINT "comms_entries_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "comms_entries"
  ADD CONSTRAINT "comms_entries_updated_by_id_fkey"
  FOREIGN KEY ("updated_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

DROP INDEX IF EXISTS "comms_entries_project_id_entry_date_idx";
CREATE INDEX IF NOT EXISTS "comms_entries_project_id_direction_entry_date_idx"
  ON "comms_entries"("project_id", "direction", "entry_date");
