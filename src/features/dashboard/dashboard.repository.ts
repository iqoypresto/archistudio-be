import { ProjectStatus, ReportStatus } from "@prisma/client";
import { prisma } from "../../configs/prisma-client.config.js";
import { DashboardOverviewRepository } from "./dashboard-overview.repository.js";

export class DashboardRepository {
  /** Menghitung jumlah proyek aktif berstatus BERJALAN (non-arsip & non-selesai). */
  static async countActiveProjects(projectId?: string) {
    return prisma.project.count({
      where: {
        deletedAt: null,
        archivedAt: null,
        status: ProjectStatus.BERJALAN,
        ...(projectId ? { id: projectId } : {}),
      },
    });
  }

  /** Mengambil seluruh area aktif pada proyek BERJALAN beserta penugasan, laporan, dan unlock. */
  static async findActiveAreasWithDetails(projectId?: string) {
    return prisma.area.findMany({
      where: {
        deletedAt: null,
        project: {
          deletedAt: null,
          archivedAt: null,
          status: ProjectStatus.BERJALAN,
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
                role: true,
                isActive: true,
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

  /** Mengambil ringkasan lintas sistem untuk Dashboard Office. */
  static async getSystemOverview(includeOwnerMetrics: boolean, now = new Date()) {
    return DashboardOverviewRepository.getSystemOverview(includeOwnerMetrics, now);
  }

  /** Mengambil rekap laporan terkirim untuk kalkulasi keterlambatan per pengawas (BR-21). */
  static async findSubmittedReportsForLateness(params: {
    projectId?: string;
    dateFrom?: Date;
    dateTo?: Date;
  }) {
    return prisma.dailyReport.findMany({
      where: {
        status: ReportStatus.SUBMITTED,
        area: {
          deletedAt: null,
          project: {
            deletedAt: null,
            ...(params.projectId ? { id: params.projectId } : {}),
          },
        },
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
            role: true,
            jobTitle: true,
          },
        },
      },
    });
  }
}
