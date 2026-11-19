-- CreateEnum
CREATE TYPE "PayeeType" AS ENUM ('FREELANCE', 'AGENT');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PAID', 'UNPAID');

-- CreateEnum
CREATE TYPE "DrawingDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "ProjectDocumentType" AS ENUM ('QUOTATION', 'BAST', 'INVOICE');

-- CreateEnum
CREATE TYPE "CommsDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "archived_at" TIMESTAMP(3),
ADD COLUMN     "completed_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "report_photos" ADD COLUMN     "uploaded_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "external_payees" (
    "id" TEXT NOT NULL,
    "type" "PayeeType" NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_payees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_records" (
    "id" TEXT NOT NULL,
    "payee_id" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "amount" DECIMAL(14,2) NOT NULL,
    "record_date" DATE NOT NULL,
    "due_date" DATE,
    "proof_storage_key" TEXT,
    "proof_file_name" TEXT,
    "proof_mime_type" TEXT,
    "proof_size_bytes" INTEGER,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drawings" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "direction" "DrawingDirection" NOT NULL,
    "storage_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "drawings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_documents" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "type" "ProjectDocumentType" NOT NULL,
    "storage_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comms_entries" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "direction" "CommsDirection" NOT NULL,
    "entry_date" DATE NOT NULL,
    "subject" TEXT NOT NULL,
    "note" TEXT,
    "attachment_key" TEXT,
    "attachment_name" TEXT,
    "attachment_mime" TEXT,
    "attachment_bytes" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comms_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "external_payees_type_name_idx" ON "external_payees"("type", "name");

-- CreateIndex
CREATE INDEX "payment_records_payee_id_record_date_idx" ON "payment_records"("payee_id", "record_date");

-- CreateIndex
CREATE INDEX "payment_records_status_due_date_idx" ON "payment_records"("status", "due_date");

-- CreateIndex
CREATE INDEX "drawings_project_id_direction_archived_at_uploaded_at_idx" ON "drawings"("project_id", "direction", "archived_at", "uploaded_at");

-- CreateIndex
CREATE INDEX "project_documents_project_id_type_uploaded_at_idx" ON "project_documents"("project_id", "type", "uploaded_at");

-- CreateIndex
CREATE INDEX "comms_entries_project_id_entry_date_idx" ON "comms_entries"("project_id", "entry_date");

-- AddForeignKey
ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_payee_id_fkey" FOREIGN KEY ("payee_id") REFERENCES "external_payees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drawings" ADD CONSTRAINT "drawings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comms_entries" ADD CONSTRAINT "comms_entries_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Partial indexes for lazy report archiving and archive listing (BR-25).
CREATE INDEX "idx_daily_reports_archive_due"
  ON "daily_reports" ("report_date", "status")
  WHERE "status" = 'SUBMITTED' AND "archived_at" IS NULL;

CREATE INDEX "idx_daily_reports_archived"
  ON "daily_reports" ("archived_at" DESC, "report_date" DESC)
  WHERE "archived_at" IS NOT NULL;
