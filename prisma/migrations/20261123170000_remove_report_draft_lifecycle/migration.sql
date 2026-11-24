DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "daily_reports" WHERE "status"::text = 'DRAFT'
  ) THEN
    RAISE EXCEPTION 'Draft reports must be cleared before this migration can run.';
  END IF;
END $$;

-- Rebuild the partial index because its predicate is bound to the old enum type.
DROP INDEX "idx_daily_reports_archive_due";
ALTER TABLE "daily_reports" ALTER COLUMN "status" DROP DEFAULT;
ALTER TYPE "ReportStatus" RENAME TO "ReportStatus_legacy";
CREATE TYPE "ReportStatus" AS ENUM ('SUBMITTED');
ALTER TABLE "daily_reports"
  ALTER COLUMN "status" TYPE "ReportStatus"
  USING ("status"::text::"ReportStatus");
ALTER TABLE "daily_reports"
  ALTER COLUMN "status" SET DEFAULT 'SUBMITTED'::"ReportStatus";
DROP TYPE "ReportStatus_legacy";
CREATE INDEX "idx_daily_reports_archive_due"
  ON "daily_reports" ("report_date", "status")
  WHERE "status" = 'SUBMITTED' AND "archived_at" IS NULL;
