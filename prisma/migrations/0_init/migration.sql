-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'SUPERVISOR');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('PERSIAPAN', 'BERJALAN', 'SELESAI');

-- CreateEnum
CREATE TYPE "WeatherType" AS ENUM ('CERAH', 'BERAWAN', 'HUJAN');

-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('WORK', 'NO_WORK');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('DRAFT', 'SUBMITTED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "job_title" TEXT NOT NULL DEFAULT 'Supervisor',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "client_name" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "status" "ProjectStatus" NOT NULL DEFAULT 'PERSIAPAN',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Jakarta',
    "routine_holidays" INTEGER[] DEFAULT ARRAY[0]::INTEGER[],
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "areas" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "area_assignments" (
    "id" TEXT NOT NULL,
    "area_id" TEXT NOT NULL,
    "supervisor_id" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "assigned_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "area_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_reports" (
    "id" TEXT NOT NULL,
    "report_number" TEXT NOT NULL,
    "area_id" TEXT NOT NULL,
    "supervisor_id" TEXT NOT NULL,
    "report_date" DATE NOT NULL,
    "report_type" "ReportType" NOT NULL DEFAULT 'WORK',
    "status" "ReportStatus" NOT NULL DEFAULT 'DRAFT',
    "progress_text" TEXT,
    "obstacles_text" TEXT,
    "tomorrow_plan_text" TEXT,
    "weather" "WeatherType",
    "worker_count" INTEGER,
    "no_work_reason" TEXT,
    "location_text" TEXT,
    "submitted_at" TIMESTAMP(3),
    "is_late" BOOLEAN NOT NULL DEFAULT false,
    "signed_by_name" TEXT,
    "signed_by_title" TEXT,
    "is_revised" BOOLEAN NOT NULL DEFAULT false,
    "revision_no" INTEGER NOT NULL DEFAULT 0,
    "revised_at" TIMESTAMP(3),
    "revised_by_id" TEXT,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_photos" (
    "id" TEXT NOT NULL,
    "report_id" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "caption" TEXT,
    "sort_order" INTEGER NOT NULL,
    "taken_at" TIMESTAMP(3),
    "uploaded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_revisions" (
    "id" TEXT NOT NULL,
    "report_id" TEXT NOT NULL,
    "revision_no" INTEGER NOT NULL,
    "revised_by_id" TEXT NOT NULL,
    "change_summary" TEXT NOT NULL,
    "previous_snapshot_json" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_unlocks" (
    "id" TEXT NOT NULL,
    "area_id" TEXT NOT NULL,
    "unlocked_by_id" TEXT NOT NULL,
    "unlocked_through_date" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_unlocks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE INDEX "users_role_is_active_idx" ON "users"("role", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "projects_code_key" ON "projects"("code");

-- CreateIndex
CREATE INDEX "projects_status_deleted_at_idx" ON "projects"("status", "deleted_at");

-- CreateIndex
CREATE INDEX "areas_project_id_deleted_at_idx" ON "areas"("project_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "areas_project_id_code_key" ON "areas"("project_id", "code");

-- CreateIndex
CREATE INDEX "area_assignments_supervisor_id_end_date_idx" ON "area_assignments"("supervisor_id", "end_date");

-- CreateIndex
CREATE INDEX "area_assignments_area_id_start_date_end_date_idx" ON "area_assignments"("area_id", "start_date", "end_date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_reports_report_number_key" ON "daily_reports"("report_number");

-- CreateIndex
CREATE INDEX "daily_reports_supervisor_id_is_late_idx" ON "daily_reports"("supervisor_id", "is_late");

-- CreateIndex
CREATE INDEX "daily_reports_report_date_status_idx" ON "daily_reports"("report_date", "status");

-- CreateIndex
CREATE UNIQUE INDEX "daily_reports_area_id_report_date_key" ON "daily_reports"("area_id", "report_date");

-- CreateIndex
CREATE INDEX "report_photos_report_id_sort_order_idx" ON "report_photos"("report_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "report_revisions_report_id_revision_no_key" ON "report_revisions"("report_id", "revision_no");

-- CreateIndex
CREATE INDEX "report_unlocks_area_id_created_at_idx" ON "report_unlocks"("area_id", "created_at");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "areas" ADD CONSTRAINT "areas_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "area_assignments" ADD CONSTRAINT "area_assignments_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "area_assignments" ADD CONSTRAINT "area_assignments_supervisor_id_fkey" FOREIGN KEY ("supervisor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "area_assignments" ADD CONSTRAINT "area_assignments_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_reports" ADD CONSTRAINT "daily_reports_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_reports" ADD CONSTRAINT "daily_reports_supervisor_id_fkey" FOREIGN KEY ("supervisor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_reports" ADD CONSTRAINT "daily_reports_revised_by_id_fkey" FOREIGN KEY ("revised_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_photos" ADD CONSTRAINT "report_photos_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "daily_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_photos" ADD CONSTRAINT "report_photos_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_revisions" ADD CONSTRAINT "report_revisions_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "daily_reports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_revisions" ADD CONSTRAINT "report_revisions_revised_by_id_fkey" FOREIGN KEY ("revised_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_unlocks" ADD CONSTRAINT "report_unlocks_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_unlocks" ADD CONSTRAINT "report_unlocks_unlocked_by_id_fkey" FOREIGN KEY ("unlocked_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Existing partial index from the Fase 1 database setup (BR-08).
CREATE UNIQUE INDEX "uq_active_area_assignment"
  ON "area_assignments" ("area_id")
  WHERE "end_date" IS NULL;
