import type { z } from "zod";
import type { UploadValidation } from "./upload.validation.js";

export type FieldUploadBody = z.infer<typeof UploadValidation.BODY.fieldSession>;
export type OfficeUploadBody = z.infer<typeof UploadValidation.BODY.officeSession>;
export type UploadInitBody = FieldUploadBody | OfficeUploadBody;
export type UploadPurpose = OfficeUploadBody["purpose"] | "report-photo";

export interface UploadSessionReceipt {
  storedFileId: string;
  uploadSessionId: string;
  chunkSizeBytes: number;
  expiresAt: string;
  fileName: string;
  contentType: string;
  fileSizeBytes: number;
}

export interface UploadSessionStatus {
  status: string;
  nextOffsetBytes: number;
  totalBytes: number;
  expiresAt: string;
}

export interface UploadChunkRange {
  start: number;
  end: number;
  total: number;
}

export interface CompletedUpload {
  storedFileId: string;
  fileName: string;
  contentType: string;
  fileSizeBytes: number;
  uploadedAt: string;
}
