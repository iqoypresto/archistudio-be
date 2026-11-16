import { Prisma, ReportStatus } from "@prisma/client";
import { prisma } from "../../configs/prisma-client.config.js";
import {
  buildPhotoCreateRows,
  replacePhotosInTx,
  REPORT_DETAIL_INCLUDE,
  REPORT_LIST_SELECT,
  type DraftMutationData,
} from "./report.prisma.js";
import type { ReportPhotoInput } from "./report.type.js";

export class ReportRepository {
  /** Mengambil konteks area, penugasan, laporan terkirim, dan buka kunci untuk validasi draf. */
  static async findAreaContextForDraft(areaId: string) {
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
          where: { archivedAt: null },
          select: { id: true, reportDate: true, status: true },
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
        archivedAt: null,
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

  /** Membuat draf laporan harian baru beserta daftar foto awal dalam satu transaksi. */
  static async createDraftReport(input: {
    reportNumber: string;
    areaId: string;
    supervisorId: string;
    reportDate: Date;
    data: DraftMutationData;
    photos: ReportPhotoInput[];
  }) {
    return prisma.dailyReport.create({
      data: {
        reportNumber: input.reportNumber,
        areaId: input.areaId,
        supervisorId: input.supervisorId,
        reportDate: input.reportDate,
        status: ReportStatus.DRAFT,
        ...input.data,
        photos: input.photos.length
          ? { create: buildPhotoCreateRows(input.photos, input.supervisorId) }
          : undefined,
      },
      include: REPORT_DETAIL_INCLUDE,
    });
  }

  /** Memperbarui isi draf dan mengganti daftar foto bila disertakan. */
  static async updateDraftReport(input: {
    reportId: string;
    uploadedById: string;
    data: DraftMutationData;
    photos?: ReportPhotoInput[];
  }) {
    return prisma.$transaction(async (tx) => {
      await replacePhotosInTx(tx, input.reportId, input.photos, input.uploadedById);
      return tx.dailyReport.update({
        where: { id: input.reportId },
        data: input.data,
        include: REPORT_DETAIL_INCLUDE,
      });
    });
  }

  /** Mengirim laporan (DRAFT -> SUBMITTED) beserta paraf otomatis secara atomik (BR-17, BR-26). */
  static async submitReportTransaction(input: {
    reportId: string;
    uploadedById: string;
    data: DraftMutationData;
    photos?: ReportPhotoInput[];
    submittedAt: Date;
    isLate: boolean;
    signedByName: string;
    signedByTitle: string;
  }) {
    return prisma.$transaction(async (tx) => {
      await replacePhotosInTx(tx, input.reportId, input.photos, input.uploadedById);
      return tx.dailyReport.update({
        where: { id: input.reportId },
        data: {
          ...input.data,
          status: ReportStatus.SUBMITTED,
          submittedAt: input.submittedAt,
          isLate: input.isLate,
          signedByName: input.signedByName,
          signedByTitle: input.signedByTitle,
        },
        include: REPORT_DETAIL_INCLUDE,
      });
    });
  }
}
