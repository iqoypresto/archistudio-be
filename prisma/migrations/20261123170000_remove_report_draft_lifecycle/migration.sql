DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "daily_reports" WHERE "status"::text = 'DRAFT'
  ) THEN
    RAISE EXCEPTION 'Draft reports must be cleared before this migration can run.';
  END IF;
END $$;

ALTER TABLE "daily_reports" ALTER COLUMN "status" DROP DEFAULT;
ALTER TYPE "ReportStatus" RENAME TO "ReportStatus_legacy";
CREATE TYPE "ReportStatus" AS ENUM ('SUBMITTED');
ALTER TABLE "daily_reports"
  ALTER COLUMN "status" TYPE "ReportStatus"
  USING ("status"::text::"ReportStatus");
ALTER TABLE "daily_reports"
  ALTER COLUMN "status" SET DEFAULT 'SUBMITTED'::"ReportStatus";
DROP TYPE "ReportStatus_legacy";
