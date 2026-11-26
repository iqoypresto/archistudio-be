import { normalizePhotoTakenAt } from "./report.photo-time.js";
import type { ReportPhotoInput } from "./report.type.js";

/** Normalizes optional EXIF time before storing the photo relation. */
export async function enrichReportPhotoMetadata(
  photos: ReportPhotoInput[] | undefined,
  projectTimeZone: string,
): Promise<ReportPhotoInput[] | undefined> {
  if (!photos) return undefined;
  return photos.map((photo) => ({
    ...photo,
    takenAt: normalizePhotoTakenAt(photo.takenAt, projectTimeZone)?.toISOString() ?? null,
  }));
}

/** Mengubah relasi foto tersimpan menjadi payload saat submit tanpa foto baru dikirim. */
export function mapStoredReportPhotos(
  photos: { storedFileId: string; caption: string | null; sortOrder: number; takenAt: Date | null }[],
): ReportPhotoInput[] {
  return photos.map((photo) => ({
    storedFileId: photo.storedFileId,
    caption: photo.caption,
    sortOrder: photo.sortOrder,
    takenAt: photo.takenAt?.toISOString() ?? null,
  }));
}
