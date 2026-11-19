import { Prisma, ReportStatus, type ReportType, type WeatherType } from "@prisma/client";
import type { ReportPhotoInput } from "./report.type.js";

export const REPORT_LIST_SELECT = Prisma.validator<Prisma.DailyReportSelect>()({
  id: true,
  reportNumber: true,
  reportDate: true,
  reportType: true,
  status: true,
  isLate: true,
  isRevised: true,
  submittedAt: true,
  archivedAt: true,
  signedByName: true,
  signedByTitle: true,
  area: {
    select: {
      id: true,
      code: true,
      name: true,
      project: { select: { id: true, code: true, name: true, timezone: true } },
    },
  },
  supervisor: { select: { id: true, name: true, jobTitle: true } },
  _count: { select: { photos: true } },
});

export const REPORT_DETAIL_INCLUDE = Prisma.validator<Prisma.DailyReportInclude>()({
  area: {
    select: {
      id: true,
      code: true,
      name: true,
      deletedAt: true,
      project: {
        select: {
          id: true,
          code: true,
          name: true,
          timezone: true,
          startDate: true,
          endDate: true,
          routineHolidays: true,
          deletedAt: true,
        },
      },
      assignments: { select: { supervisorId: true, startDate: true, endDate: true } },
      unlocks: {
        orderBy: { unlockedThroughDate: "desc" },
        take: 1,
        select: { unlockedThroughDate: true },
      },
      reports: {
        where: { status: ReportStatus.SUBMITTED },
        select: { reportDate: true },
      },
    },
  },
  supervisor: { select: { id: true, name: true, jobTitle: true } },
  photos: { orderBy: { sortOrder: "asc" } },
  revisions: {
    orderBy: { revisionNo: "desc" },
    include: { revisedBy: { select: { name: true } } },
  },
});

export interface DraftMutationData {
  reportType?: ReportType;
  progressText?: string | null;
  obstaclesText?: string | null;
  tomorrowPlanText?: string | null;
  weather?: WeatherType | null;
  workerCount?: number | null;
  noWorkReason?: string | null;
  locationText?: string | null;
}

export function buildPhotoCreateRows(photos: ReportPhotoInput[], uploadedById: string) {
  return photos.map((photo) => ({
    storageKey: photo.storageKey,
    caption: photo.caption ?? null,
    sortOrder: photo.sortOrder,
    takenAt: photo.takenAt ? new Date(photo.takenAt) : null,
    uploadedAt: photo.uploadedAt ? new Date(photo.uploadedAt) : null,
    uploadedById,
  }));
}

export async function replacePhotosInTx(
  tx: Prisma.TransactionClient,
  reportId: string,
  photos: ReportPhotoInput[] | undefined,
  uploadedById: string,
): Promise<void> {
  if (photos === undefined) return;
  await tx.reportPhoto.deleteMany({ where: { reportId } });
  if (photos.length === 0) return;
  await tx.reportPhoto.createMany({
    data: buildPhotoCreateRows(photos, uploadedById).map((row) => ({ ...row, reportId })),
  });
}

export type ReportListRecord = Prisma.DailyReportGetPayload<{
  select: typeof REPORT_LIST_SELECT;
}>;
export type ReportDetailRecord = Prisma.DailyReportGetPayload<{
  include: typeof REPORT_DETAIL_INCLUDE;
}>;
