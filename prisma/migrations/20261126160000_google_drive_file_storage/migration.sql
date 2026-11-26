-- The development environment has no stored files to backfill. Clear only the
-- file-only child rows and temporary upload registrations before switching to Drive IDs.
DELETE FROM "report_upload_session_photos";
DELETE FROM "report_photos";
DELETE FROM "drawings";
DELETE FROM "project_documents";

UPDATE "report_revisions"
SET "previous_snapshot_json" = jsonb_set("previous_snapshot_json", '{photos}', '[]'::jsonb, true)
WHERE "previous_snapshot_json" ? 'photos';

CREATE TYPE "StoragePurpose" AS ENUM ('REPORT_PHOTO', 'PAYMENT_PROOF', 'DRAWING', 'PROJECT_DOCUMENT', 'COMMS_ATTACHMENT');
CREATE TYPE "StoredFileStatus" AS ENUM ('UPLOADING', 'READY', 'DELETE_PENDING', 'DELETED', 'FAILED');
CREATE TYPE "DriveUploadSessionStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED', 'EXPIRED', 'FAILED');
CREATE TYPE "StorageTargetType" AS ENUM ('REPORT_UPLOAD_SESSION', 'REPORT', 'PAYEE', 'PROJECT');

CREATE TABLE "stored_files" (
  "id" TEXT NOT NULL,
  "drive_file_id" TEXT,
  "drive_folder_id" TEXT NOT NULL,
  "purpose" "StoragePurpose" NOT NULL,
  "target_type" "StorageTargetType" NOT NULL,
  "target_id" TEXT NOT NULL,
  "target_qualifier" TEXT,
  "file_name" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "status" "StoredFileStatus" NOT NULL DEFAULT 'UPLOADING',
  "uploaded_by_id" TEXT NOT NULL,
  "uploaded_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "stored_files_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "stored_files_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "drive_upload_sessions" (
  "id" TEXT NOT NULL,
  "stored_file_id" TEXT NOT NULL,
  "session_uri_ciphertext" TEXT,
  "next_offset_bytes" INTEGER NOT NULL DEFAULT 0,
  "status" "DriveUploadSessionStatus" NOT NULL DEFAULT 'ACTIVE',
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "drive_upload_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "drive_upload_sessions_stored_file_id_fkey" FOREIGN KEY ("stored_file_id") REFERENCES "stored_files"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "stored_files_drive_file_id_key" ON "stored_files"("drive_file_id");
CREATE INDEX "stored_files_purpose_target_type_target_id_status_idx" ON "stored_files"("purpose", "target_type", "target_id", "status");
CREATE INDEX "stored_files_uploaded_by_id_created_at_idx" ON "stored_files"("uploaded_by_id", "created_at");
CREATE INDEX "stored_files_status_created_at_idx" ON "stored_files"("status", "created_at");
CREATE UNIQUE INDEX "drive_upload_sessions_stored_file_id_key" ON "drive_upload_sessions"("stored_file_id");
CREATE INDEX "drive_upload_sessions_status_expires_at_idx" ON "drive_upload_sessions"("status", "expires_at");

DROP INDEX IF EXISTS "report_upload_session_photos_storage_key_key";
ALTER TABLE "report_upload_session_photos" DROP COLUMN "storage_key";
ALTER TABLE "report_upload_session_photos" ADD COLUMN "stored_file_id" TEXT NOT NULL;
CREATE UNIQUE INDEX "report_upload_session_photos_stored_file_id_key" ON "report_upload_session_photos"("stored_file_id");
ALTER TABLE "report_upload_session_photos"
  ADD CONSTRAINT "report_upload_session_photos_stored_file_id_fkey"
  FOREIGN KEY ("stored_file_id") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "report_photos" DROP CONSTRAINT "report_photos_uploaded_by_id_fkey";
ALTER TABLE "report_photos" DROP COLUMN "storage_key";
ALTER TABLE "report_photos" DROP COLUMN "uploaded_at";
ALTER TABLE "report_photos" DROP COLUMN "uploaded_by_id";
ALTER TABLE "report_photos" ADD COLUMN "stored_file_id" TEXT NOT NULL;
CREATE UNIQUE INDEX "report_photos_stored_file_id_key" ON "report_photos"("stored_file_id");
ALTER TABLE "report_photos"
  ADD CONSTRAINT "report_photos_stored_file_id_fkey"
  FOREIGN KEY ("stored_file_id") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payment_records" DROP COLUMN "proof_storage_key";
ALTER TABLE "payment_records" DROP COLUMN "proof_file_name";
ALTER TABLE "payment_records" DROP COLUMN "proof_mime_type";
ALTER TABLE "payment_records" DROP COLUMN "proof_size_bytes";
ALTER TABLE "payment_records" ADD COLUMN "proof_stored_file_id" TEXT;
CREATE UNIQUE INDEX "payment_records_proof_stored_file_id_key" ON "payment_records"("proof_stored_file_id");
ALTER TABLE "payment_records"
  ADD CONSTRAINT "payment_records_proof_stored_file_id_fkey"
  FOREIGN KEY ("proof_stored_file_id") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DROP INDEX "drawings_project_id_archived_at_uploaded_at_idx";
ALTER TABLE "drawings" DROP COLUMN "storage_key";
ALTER TABLE "drawings" DROP COLUMN "file_name";
ALTER TABLE "drawings" DROP COLUMN "mime_type";
ALTER TABLE "drawings" DROP COLUMN "size_bytes";
ALTER TABLE "drawings" DROP COLUMN "uploaded_at";
ALTER TABLE "drawings" ADD COLUMN "stored_file_id" TEXT NOT NULL;
CREATE UNIQUE INDEX "drawings_stored_file_id_key" ON "drawings"("stored_file_id");
CREATE INDEX "drawings_project_id_archived_at_idx" ON "drawings"("project_id", "archived_at");
ALTER TABLE "drawings"
  ADD CONSTRAINT "drawings_stored_file_id_fkey"
  FOREIGN KEY ("stored_file_id") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DROP INDEX "project_documents_project_id_type_uploaded_at_idx";
ALTER TABLE "project_documents" DROP COLUMN "storage_key";
ALTER TABLE "project_documents" DROP COLUMN "file_name";
ALTER TABLE "project_documents" DROP COLUMN "mime_type";
ALTER TABLE "project_documents" DROP COLUMN "size_bytes";
ALTER TABLE "project_documents" DROP COLUMN "uploaded_at";
ALTER TABLE "project_documents" ADD COLUMN "stored_file_id" TEXT NOT NULL;
CREATE UNIQUE INDEX "project_documents_stored_file_id_key" ON "project_documents"("stored_file_id");
CREATE INDEX "project_documents_project_id_type_idx" ON "project_documents"("project_id", "type");
ALTER TABLE "project_documents"
  ADD CONSTRAINT "project_documents_stored_file_id_fkey"
  FOREIGN KEY ("stored_file_id") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "comms_entries" DROP COLUMN "attachment_key";
ALTER TABLE "comms_entries" DROP COLUMN "attachment_name";
ALTER TABLE "comms_entries" DROP COLUMN "attachment_mime";
ALTER TABLE "comms_entries" DROP COLUMN "attachment_bytes";
ALTER TABLE "comms_entries" ADD COLUMN "attachment_stored_file_id" TEXT;
CREATE UNIQUE INDEX "comms_entries_attachment_stored_file_id_key" ON "comms_entries"("attachment_stored_file_id");
ALTER TABLE "comms_entries"
  ADD CONSTRAINT "comms_entries_attachment_stored_file_id_fkey"
  FOREIGN KEY ("attachment_stored_file_id") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
