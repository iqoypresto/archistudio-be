import type { z } from "zod";
import type { UploadValidation } from "./upload.validation.js";

export type SignUploadBody = z.infer<typeof UploadValidation.BODY.sign>;
export type ViewUrlsBody = z.infer<typeof UploadValidation.BODY.viewUrls>;

export interface SignedUploadFileItem {
  uploadUrl: string;
  storageKey: string;
  expiresInSeconds: number;
}

export interface SignedPhotoViewItem {
  photoId: string;
  viewUrl: string;
  caption: string | null;
  sortOrder: number;
}
