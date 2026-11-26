import type { StoredFile } from "@prisma/client";
import { downloadDriveFileBuffer } from "../../utils/storage/drive-file.adapter.js";

export async function toPdfPhotoDataUrl(file: Pick<StoredFile, "driveFileId" | "mimeType" | "sizeBytes">): Promise<string | null> {
  if (!file.driveFileId) return null;
  try {
    const bytes = await downloadDriveFileBuffer(file.driveFileId, file.sizeBytes);
    if (bytes.byteLength !== file.sizeBytes) return null;
    return `data:${file.mimeType};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}
