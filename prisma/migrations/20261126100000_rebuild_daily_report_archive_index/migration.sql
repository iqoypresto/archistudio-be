-- Keep the already-applied report status migration immutable. Rebuild its partial index here.
DROP INDEX IF EXISTS "idx_daily_reports_archive_due";
CREATE INDEX "idx_daily_reports_archive_due"
  ON "daily_reports" ("report_date", "status")
  WHERE "status" = 'SUBMITTED' AND "archived_at" IS NULL;
