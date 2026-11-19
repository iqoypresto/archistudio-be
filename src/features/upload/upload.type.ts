import type { z } from "zod";
import type { UploadValidation } from "./upload.validation.js";

export type SignUploadBody = z.infer<typeof UploadValidation.BODY.sign>;
export type PurposeUploadBody = Extract<SignUploadBody, { purpose: string }>;
export type ViewUrlsBody = z.infer<typeof UploadValidation.BODY.viewUrls>;

export interface SignedUploadFileItem {
  uploadUrl: string;
  storageKey: string;
  expiresInSeconds: number;
}

export interface SignedPurposeUploadItem extends SignedUploadFileItem {
  purpose: PurposeUploadBody["purpose"];
  fileName: string;
  contentType: string;
  fileSizeBytes: number;
}

export interface SignedPhotoViewItem {
  photoId: string;
  viewUrl: string;
  caption: string | null;
  sortOrder: number;
}
