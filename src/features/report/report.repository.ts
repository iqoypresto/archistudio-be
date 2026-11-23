import { Prisma, ReportStatus } from "@prisma/client";
import { prisma } from "../../configs/prisma-client.config.js";
import {
  buildPhotoCreateRows,
  replacePhotosInTx,
  REPORT_DETAIL_INCLUDE,
  REPORT_LIST_SELECT,
  type ReportMutationData,
} from "./report.prisma.js";
import type { ReportPhotoInput } from "./report.type.js";

export class ReportRepository {
  /** Mengambil konteks area, penugasan, laporan terkirim, dan buka kunci untuk submit. */
  static async findAreaContextForSubmit(areaId: string) {
    return prisma.area.findFirst({
      where: { id: areaId, deletedAt: null, project: { deletedAt: null } },
      select: {
        id: true,
        code: true,
        project: {
          select: {
            id: true,
            code: true,
            startDate: true,
            endDate: true,
            timezone: true,
            routineHolidays: true,
          },
        },
        assignments: { select: { supervisorId: true, startDate: true, endDate: true } },
        reports: {
          select: { id: true, reportDate: true, status: true, supervisorId: true },
        },
        unlocks: {
          orderBy: { unlockedThroughDate: "desc" },
          take: 1,
          select: { unlockedThroughDate: true },
        },
      },
    });
  }

  /** Mengambil detail lengkap laporan harian beserta relasi & revisinya. */
  static async findReportDetailById(reportId: string) {
    return prisma.dailyReport.findFirst({
      where: {
        id: reportId,
        area: { deletedAt: null, project: { deletedAt: null } },
      },
      include: REPORT_DETAIL_INCLUDE,
    });
  }

  /** Mengambil daftar laporan berpaginasi beserta total data secara atomik. */
  static async findReportsPaginated(params: {
    where: Prisma.DailyReportWhereInput;
    skip: number;
    take: number;
    orderBy: Prisma.DailyReportOrderByWithRelationInput;
  }) {
    return prisma.$transaction([
      prisma.dailyReport.findMany({
        where: params.where,
        skip: params.skip,
        take: params.take,
        orderBy: params.orderBy,
        select: REPORT_LIST_SELECT,
      }),
      prisma.dailyReport.count({ where: params.where }),
    ]);
  }

  /** Menyimpan laporan dan foto langsung sebagai SUBMITTED dalam satu transaksi DB. */
  static async createSubmittedReport(input: {
    reportNumber: string; areaId: string; supervisorId: string; reportDate: Date;
    data: ReportMutationData; photos: ReportPhotoInput[]; submittedAt: Date;
    archivedAt: Date | null; isLate: boolean; signedByName: string; signedByTitle: string;
  }) {
    return prisma.dailyReport.create({
      data: {
        reportNumber: input.reportNumber, areaId: input.areaId,
        supervisorId: input.supervisorId, reportDate: input.reportDate,
        status: ReportStatus.SUBMITTED, ...input.data,
        photos: { create: buildPhotoCreateRows(input.photos, input.supervisorId) },
        submittedAt: input.submittedAt, archivedAt: input.archivedAt,
        isLate: input.isLate, signedByName: input.signedByName,
        signedByTitle: input.signedByTitle,
      },
      include: REPORT_DETAIL_INCLUDE,
    });
  }

  /** Mencatat snapshot revisi dan memperbarui laporan terkirim oleh Owner secara atomik (ADR-05, BR-24). */
  static async reviseReportTransaction(input: {
    reportId: string;
    revisedById: string;
    revisionNo: number;
    changeSummary: string;
    previousSnapshotJson: Prisma.InputJsonValue;
    data: ReportMutationData;
    photos?: ReportPhotoInput[];
    revisedAt: Date;
  }) {
    return prisma.$transaction(async (tx) => {
      await tx.reportRevision.create({
        data: {
          reportId: input.reportId,
          revisionNo: input.revisionNo,
          revisedById: input.revisedById,
          changeSummary: input.changeSummary,
          previousSnapshotJson: input.previousSnapshotJson,
        },
      });
      await replacePhotosInTx(tx, input.reportId, input.photos, input.revisedById);
      return tx.dailyReport.update({
        where: { id: input.reportId },
        data: {
          ...input.data,
          isRevised: true,
          revisionNo: input.revisionNo,
          revisedAt: input.revisedAt,
          revisedById: input.revisedById,
        },
        include: REPORT_DETAIL_INCLUDE,
      });
    });
  }
}
