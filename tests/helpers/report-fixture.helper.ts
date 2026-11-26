import {
  ProjectStatus,
  ReportStatus,
  ReportType,
  Role,
  StoragePurpose,
  StorageTargetType,
  StoredFileStatus,
  WeatherType,
} from "@prisma/client";
import { signAccessToken } from "../../src/utils/auth/jwt.util.js";

export const TEST_AREA_ID = "11111111-1111-4111-8111-111111111111";
export const TEST_PROJECT_ID = "22222222-2222-4222-8222-222222222222";
export const TEST_REPORT_ID = "44444444-4444-4444-8444-444444444444";
export const TEST_STORED_FILE_ID = "66666666-6666-4666-8666-666666666666";

export function makeSupervisorAuthHeader(sub = "sup-1") {
  return {
    Authorization: `Bearer ${signAccessToken({
      sub,
      role: Role.SUPERVISOR,
      username: "sup1",
      name: "Budi Pengawas",
      jobTitle: "Supervisor Lapangan",
    })}`,
  };
}

export function makeReportRecord(overrides?: {
  status?: ReportStatus;
  reportType?: ReportType;
  isLate?: boolean;
  timezone?: string;
  projectStatus?: ProjectStatus;
  projectArchivedAt?: Date | null;
  submittedDates?: Date[];
  photosCount?: number;
}) {
  const status = overrides?.status ?? ReportStatus.SUBMITTED;
  const photos = Array.from({ length: overrides?.photosCount ?? 1 }).map((_, i) => ({
    id: `photo-${i}`,
    reportId: TEST_REPORT_ID,
    storedFileId: TEST_STORED_FILE_ID,
    caption: "Foto bukti",
    sortOrder: i,
    takenAt: null,
    createdAt: new Date(),
    storedFile: {
      id: TEST_STORED_FILE_ID,
      driveFileId: `drive-file-${i}`,
      driveFolderId: "drive-folder-1",
      purpose: StoragePurpose.REPORT_PHOTO,
      targetType: StorageTargetType.REPORT_UPLOAD_SESSION,
      targetId: "55555555-5555-4555-8555-555555555555",
      targetQualifier: null,
      fileName: `photo-${i}.jpg`,
      mimeType: "image/jpeg",
      sizeBytes: 120_000,
      status: StoredFileStatus.READY,
      uploadedById: "sup-1",
      uploadedAt: new Date("2026-11-16T08:55:00.000Z"),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  }));
  return {
    id: TEST_REPORT_ID,
    reportNumber: "LH/VLA01/A/20261116",
    areaId: TEST_AREA_ID,
    supervisorId: "sup-1",
    reportDate: new Date("2026-11-16T00:00:00.000Z"),
    reportType: overrides?.reportType ?? ReportType.WORK,
    status,
    progressText: "Cor kolom lantai 1",
    obstaclesText: "Tidak ada",
    tomorrowPlanText: "Bongkar bekisting",
    weather: WeatherType.CERAH,
    workerCount: 8,
    noWorkReason: null,
    locationText: null,
    submittedAt: status === ReportStatus.SUBMITTED ? new Date("2026-11-16T09:00:00.000Z") : null,
    isLate: overrides?.isLate ?? false,
    signedByName: status === ReportStatus.SUBMITTED ? "Budi Pengawas" : null,
    signedByTitle: status === ReportStatus.SUBMITTED ? "Supervisor Lapangan" : null,
    isRevised: false,
    revisionNo: 0,
    revisedAt: null,
    revisedById: null,
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    area: {
      id: TEST_AREA_ID,
      code: "A",
      name: "Area A",
      deletedAt: null,
      project: {
        id: TEST_PROJECT_ID,
        code: "VLA01",
        name: "Villa Ubud",
        timezone: overrides?.timezone ?? "Asia/Jakarta",
        status: overrides?.projectStatus ?? ProjectStatus.BERJALAN,
        archivedAt: overrides?.projectArchivedAt ?? null,
        startDate: new Date("2026-11-16T00:00:00.000Z"),
        endDate: null,
        routineHolidays: [0],
        siteManagerId: null as string | null,
        deletedAt: null,
      },
      assignments: [
        {
          supervisorId: "sup-1",
          startDate: new Date("2026-11-16T00:00:00.000Z"),
          endDate: null,
        },
      ],
      unlocks: [],
      reports: (overrides?.submittedDates ?? []).map((d) => ({ reportDate: d })),
    },
    supervisor: {
      id: "sup-1",
      name: "Budi Pengawas",
      jobTitle: "Supervisor Lapangan",
      role: Role.SUPERVISOR,
    },
    photos,
    revisions: [],
  };
}
