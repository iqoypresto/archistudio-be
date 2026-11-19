import { ReportStatus } from "@prisma/client";
import { prisma } from "../../configs/prisma-client.config.js";

export class DashboardRepository {
  /** Menghitung jumlah proyek aktif (tidak berstatus soft-deleted). */
  static async countActiveProjects(projectId?: string) {
    return prisma.project.count({
      where: {
        deletedAt: null,
        ...(projectId ? { id: projectId } : {}),
      },
    });
  }

  /** Mengambil seluruh area aktif beserta project, penugasan aktif, laporan, dan unlock. */
  static async findActiveAreasWithDetails(projectId?: string) {
    return prisma.area.findMany({
      where: {
        deletedAt: null,
        project: {
          deletedAt: null,
          ...(projectId ? { id: projectId } : {}),
        },
      },
      orderBy: [
        { project: { name: "asc" } },
        { code: "asc" },
      ],
      select: {
        id: true,
        code: true,
        name: true,
        project: {
          select: {
            id: true,
            code: true,
            name: true,
            location: true,
            startDate: true,
            endDate: true,
            timezone: true,
            routineHolidays: true,
          },
        },
        assignments: {
          where: { endDate: null },
          orderBy: { startDate: "desc" },
          take: 1,
          select: {
            id: true,
            startDate: true,
            endDate: true,
            supervisor: {
              select: {
                id: true,
                name: true,
                jobTitle: true,
              },
            },
          },
        },
        reports: {
          orderBy: { reportDate: "desc" },
          select: {
            id: true,
            reportNumber: true,
            reportDate: true,
            status: true,
            submittedAt: true,
            isLate: true,
            supervisorId: true,
          },
        },
        unlocks: {
          orderBy: { unlockedThroughDate: "desc" },
          take: 1,
          select: {
            unlockedThroughDate: true,
            reason: true,
          },
        },
      },
    });
  }

  /** Mengambil rekap seluruh laporan terkirim untuk kalkulasi keterlambatan supervisor. */
  static async findSubmittedReportsForLateness(params: {
    projectId?: string;
    dateFrom?: Date;
    dateTo?: Date;
  }) {
    return prisma.dailyReport.findMany({
      where: {
        status: ReportStatus.SUBMITTED,
        archivedAt: null,
        ...(params.projectId ? { area: { projectId: params.projectId } } : {}),
        ...(params.dateFrom || params.dateTo
          ? {
              reportDate: {
                ...(params.dateFrom ? { gte: params.dateFrom } : {}),
                ...(params.dateTo ? { lte: params.dateTo } : {}),
              },
            }
          : {}),
      },
      select: {
        id: true,
        isLate: true,
        supervisor: {
          select: {
            id: true,
            name: true,
            username: true,
          },
        },
      },
    });
  }
}
