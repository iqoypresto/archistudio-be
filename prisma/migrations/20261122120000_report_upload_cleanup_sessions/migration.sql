CREATE TYPE "UploadSessionStatus" AS ENUM ('UPLOADING', 'FINALIZING', 'COMMITTED', 'CLEANUP_PENDING', 'CLEANED');
CREATE TYPE "UploadSessionPhotoStatus" AS ENUM ('PENDING', 'ATTACHED', 'DELETED');

CREATE TABLE "report_upload_sessions" (
  "id" TEXT NOT NULL,
  "supervisor_id" TEXT NOT NULL,
  "area_id" TEXT NOT NULL,
  "report_date" DATE NOT NULL,
  "status" "UploadSessionStatus" NOT NULL DEFAULT 'UPLOADING',
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "report_upload_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "report_upload_sessions_supervisor_id_fkey" FOREIGN KEY ("supervisor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "report_upload_sessions_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "report_upload_session_photos" (
  "id" TEXT NOT NULL,
  "session_id" TEXT NOT NULL,
  "storage_key" TEXT NOT NULL,
  "status" "UploadSessionPhotoStatus" NOT NULL DEFAULT 'PENDING',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "report_upload_session_photos_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "report_upload_session_photos_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "report_upload_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "report_upload_session_photos_storage_key_key" ON "report_upload_session_photos"("storage_key");
CREATE INDEX "report_upload_sessions_status_expires_at_idx" ON "report_upload_sessions"("status", "expires_at");
CREATE INDEX "report_upload_sessions_supervisor_id_area_id_report_date_idx" ON "report_upload_sessions"("supervisor_id", "area_id", "report_date");
CREATE INDEX "report_upload_session_photos_session_id_status_idx" ON "report_upload_session_photos"("session_id", "status");
