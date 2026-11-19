import { ResponseError } from "../../utils/errors/response-error.util.js";
import { StorageAdapter } from "../../utils/storage/storage.adapter.js";
import { normalizePhotoTakenAt } from "./report.photo-time.js";
import type { ReportPhotoInput } from "./report.type.js";

/** Memastikan objek foto ada dan menyusun timestamp yang bersumber dari storage. */
export async function enrichReportPhotoMetadata(
  photos: ReportPhotoInput[] | undefined,
  projectTimeZone: string,
): Promise<ReportPhotoInput[] | undefined> {
  if (!photos) return undefined;
  return Promise.all(photos.map(async (photo) => {
    const storage = await StorageAdapter.getObjectLastModified(photo.storageKey);
    if (!storage.exists) throw new ResponseError("INVALID_STORAGE_KEY");
    return {
      ...photo,
      takenAt: normalizePhotoTakenAt(photo.takenAt, projectTimeZone)?.toISOString() ?? null,
      uploadedAt: storage.lastModified?.toISOString() ?? null,
    };
  }));
}

/** Mengubah relasi foto tersimpan menjadi payload saat submit tanpa foto baru dikirim. */
export function mapStoredReportPhotos(
  photos: { storageKey: string; caption: string | null; sortOrder: number; takenAt: Date | null }[],
): ReportPhotoInput[] {
  return photos.map((photo) => ({
    storageKey: photo.storageKey,
    caption: photo.caption,
    sortOrder: photo.sortOrder,
    takenAt: photo.takenAt?.toISOString() ?? null,
  }));
}
