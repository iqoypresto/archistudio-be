import { ReportType, type WeatherType } from "@prisma/client";
import type { ReportDetailRecord, ReportListRecord } from "./report.prisma.js";
import type {
  DailyReportDetail,
  DailyReportListItem,
  ReportSnapshotJson,
} from "./report.type.js";

export function toIsoDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Membentuk nomor laporan unik LH/KODEPROJECT/KODEAREA/YYYYMMDD (BR-13). */
export function buildReportNumber(
  projectCode: string,
  areaCode: string,
  reportDate: string,
): string {
  const compactDate = reportDate.replaceAll("-", "");
  return `LH/${projectCode.toUpperCase()}/${areaCode.toUpperCase()}/${compactDate}`;
}

/** Memvalidasi kelengkapan laporan sebelum dikirim sesuai tipe WORK / NO_WORK (BR-15, BR-16, BR-19). */
export function assertSubmitCompleteness(input: {
  reportType: ReportType;
  progressText?: string | null;
  obstaclesText?: string | null;
  tomorrowPlanText?: string | null;
  weather?: WeatherType | null;
  workerCount?: number | null;
  noWorkReason?: string | null;
  photosCount: number;
}): void {
  if (input.reportType === ReportType.NO_WORK) {
    if (!input.noWorkReason?.trim() || input.photosCount < 1) {
      throw new ResponseError("NO_WORK_REASON_OR_PHOTO_REQUIRED");
    }
    if (input.photosCount > 10) throw new ResponseError("INVALID_PHOTO_COUNT");
    return;
  }
  if (input.photosCount < 1 || input.photosCount > 10) {
    throw new ResponseError("INVALID_PHOTO_COUNT");
  }
  const hasAllFields =
    Boolean(input.progressText?.trim()) &&
    Boolean(input.obstaclesText?.trim()) &&
    Boolean(input.tomorrowPlanText?.trim()) &&
    Boolean(input.weather) &&
    input.workerCount !== null &&
    input.workerCount !== undefined &&
    input.workerCount >= 0;
  if (!hasAllFields) {
    throw new ResponseError("VALIDATION_ERROR");
  }
}

export function mapReportListItem(record: ReportListRecord): DailyReportListItem {
  return {
    id: record.id,
    reportNumber: record.reportNumber,
    reportDate: toIsoDateOnly(record.reportDate),
    reportType: record.reportType,
    status: record.status,
    isLate: record.isLate,
    lateLabel: record.isLate ? "Diunggah terlambat" : null,
    isRevised: record.isRevised,
    submittedAt: record.submittedAt ? record.submittedAt.toISOString() : null,
    archivedAt: record.archivedAt ? record.archivedAt.toISOString() : null,
    signedByName: record.signedByName,
    signedByTitle: record.signedByTitle,
    photoCount: record._count.photos,
    area: { id: record.area.id, code: record.area.code, name: record.area.name },
    project: {
      id: record.area.project.id,
      code: record.area.project.code,
      name: record.area.project.name,
      timezone: record.area.project.timezone,
    },
    supervisor: {
      id: record.supervisor.id,
      name: record.supervisor.name,
      jobTitle: record.supervisor.jobTitle,
    },
  };
}

export function mapReportDetail(record: ReportDetailRecord): DailyReportDetail {
  return {
    ...mapReportListItem({ ...record, _count: { photos: record.photos.length } }),
    progressText: record.progressText,
    obstaclesText: record.obstaclesText,
    tomorrowPlanText: record.tomorrowPlanText,
    weather: record.weather,
    workerCount: record.workerCount,
    noWorkReason: record.noWorkReason,
    locationText: record.locationText,
    revisionNo: record.revisionNo,
    revisedAt: record.revisedAt ? record.revisedAt.toISOString() : null,
    photos: record.photos.map((photo) => ({
      id: photo.id,
      storedFileId: photo.storedFileId,
      contentPath: `/files/${photo.storedFileId}/content`,
      fileName: photo.storedFile.fileName,
      contentType: photo.storedFile.mimeType,
      fileSizeBytes: photo.storedFile.sizeBytes,
      caption: photo.caption,
      sortOrder: photo.sortOrder,
      takenAt: photo.takenAt ? photo.takenAt.toISOString() : null,
      uploadedAt: photo.storedFile.uploadedAt?.toISOString() ?? null,
    })),
    revisions: record.revisions.map((rev) => ({
      id: rev.id,
      revisionNo: rev.revisionNo,
      changeSummary: rev.changeSummary,
      previousSnapshotJson: rev.previousSnapshotJson,
      revisedByName: rev.revisedBy.name,
      createdAt: rev.createdAt.toISOString(),
    })),
  };
}

/** Membentuk snapshot JSON utuh versi laporan sebelum direvisi Owner (ADR-05, BR-24). */
export function buildRevisionSnapshotJson(
  record: ReportDetailRecord,
): ReportSnapshotJson {
  return {
    reportType: record.reportType,
    progressText: record.progressText,
    obstaclesText: record.obstaclesText,
    tomorrowPlanText: record.tomorrowPlanText,
    weather: record.weather,
    workerCount: record.workerCount,
    noWorkReason: record.noWorkReason,
    locationText: record.locationText,
    submittedAt: record.submittedAt ? record.submittedAt.toISOString() : null,
    isLate: record.isLate,
    signedByName: record.signedByName,
    signedByTitle: record.signedByTitle,
    photos: record.photos.map((photo) => ({
      id: photo.id,
      storedFileId: photo.storedFileId,
      caption: photo.caption,
      sortOrder: photo.sortOrder,
      takenAt: photo.takenAt ? photo.takenAt.toISOString() : null,
      uploadedAt: photo.storedFile.uploadedAt?.toISOString() ?? null,
    })),
  };
}
