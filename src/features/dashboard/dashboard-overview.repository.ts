import { PaymentStatus, ProjectStatus, Role } from "@prisma/client";
import { prisma } from "../../configs/prisma-client.config.js";
import { parseDateOnlyUtc, toBusinessDateString } from "../../helpers/date.helper.js";
import type { DashboardSystemOverview } from "./dashboard.type.js";

const RECENT_ACTIVITY_DAYS = 7;

export class DashboardOverviewRepository {
  /** Mengambil ringkasan lintas sistem untuk visibilitas Dashboard Office (OWNER & ADMIN). */
  static async getSystemOverview(
    includeOwnerMetrics: boolean,
    now = new Date(),
  ): Promise<DashboardSystemOverview> {
    const since = new Date(now.getTime() - RECENT_ACTIVITY_DAYS * 86_400_000);
    const todayJakarta = parseDateOnlyUtc(toBusinessDateString(now, "Asia/Jakarta"));

    const [
      runningProjects,
      preparingProjects,
      completedProjects,
      archivedManualProjects,
      projectsWithoutSiteManager,
      userGroups,
      unassignedAreasCount,
      areasWithInactiveSupervisorCount,
      commsInCount,
      commsOutCount,
      drawingsCount,
      documentsCount,
      unpaidPayments,
    ] = await Promise.all([
      prisma.project.count({
        where: { deletedAt: null, archivedAt: null, status: ProjectStatus.BERJALAN },
      }),
      prisma.project.count({
        where: { deletedAt: null, archivedAt: null, status: ProjectStatus.PERSIAPAN },
      }),
      prisma.project.count({
        where: { deletedAt: null, status: ProjectStatus.SELESAI },
      }),
      prisma.project.count({
        where: { deletedAt: null, archivedAt: { not: null }, status: { not: ProjectStatus.SELESAI } },
      }),
      prisma.project.count({
        where: {
          deletedAt: null,
          archivedAt: null,
          status: { in: [ProjectStatus.BERJALAN, ProjectStatus.PERSIAPAN] },
          siteManagerId: null,
        },
      }),
      prisma.user.groupBy({
        by: ["role", "isActive"],
        where: { deletedAt: null },
        _count: { _all: true },
      }),
      prisma.area.count({
        where: {
          deletedAt: null,
          project: { deletedAt: null, archivedAt: null, status: ProjectStatus.BERJALAN },
          assignments: { none: { endDate: null } },
        },
      }),
      prisma.area.count({
        where: {
          deletedAt: null,
          project: { deletedAt: null, archivedAt: null, status: ProjectStatus.BERJALAN },
          assignments: { some: { endDate: null, supervisor: { isActive: false } } },
        },
      }),
      prisma.commsEntry.count({
        where: { direction: "INBOUND", createdAt: { gte: since }, project: { deletedAt: null } },
      }),
      prisma.commsEntry.count({
        where: { direction: "OUTBOUND", createdAt: { gte: since }, project: { deletedAt: null } },
      }),
      prisma.drawing.count({
        where: { archivedAt: null, storedFile: { uploadedAt: { gte: since } }, project: { deletedAt: null } },
      }),
      includeOwnerMetrics
        ? prisma.projectDocument.count({
            where: { storedFile: { uploadedAt: { gte: since } }, project: { deletedAt: null } },
          })
        : Promise.resolve(null),
      includeOwnerMetrics
        ? prisma.paymentRecord.findMany({
            where: { status: PaymentStatus.UNPAID },
            select: {
              amount: true,
              dueDate: true,
              payee: { select: { type: true } },
            },
          })
        : Promise.resolve(null),
    ]);

    let totalActive = 0;
    let inactiveCount = 0;
    const activeByRole: Record<Role, number> = {
      OWNER: 0,
      ADMIN: 0,
      SITE_MANAGER: 0,
      SUPERVISOR: 0,
    };

    for (const row of userGroups) {
      if (row.isActive) {
        totalActive += row._count._all;
        activeByRole[row.role] += row._count._all;
      } else {
        inactiveCount += row._count._all;
      }
    }

    let payments: DashboardSystemOverview["payments"] = null;
    if (unpaidPayments) {
      let totalUnpaidAmount = 0;
      let overdueUnpaidCount = 0;
      let freelanceUnpaidCount = 0;
      let agentUnpaidCount = 0;
      for (const item of unpaidPayments) {
        totalUnpaidAmount += Math.round(Number(item.amount) * 100) / 100;
        if (item.dueDate && item.dueDate < todayJakarta) overdueUnpaidCount += 1;
        if (item.payee.type === "FREELANCE") freelanceUnpaidCount += 1;
        else agentUnpaidCount += 1;
      }
      payments = {
        unpaidCount: unpaidPayments.length,
        totalUnpaidAmount: Math.round(totalUnpaidAmount * 100) / 100,
        overdueUnpaidCount,
        freelanceUnpaidCount,
        agentUnpaidCount,
      };
    }

    return {
      projects: {
        running: runningProjects,
        preparing: preparingProjects,
        completed: completedProjects,
        archivedManual: archivedManualProjects,
        withoutSiteManager: projectsWithoutSiteManager,
      },
      team: {
        totalActive,
        inactiveCount,
        ownerCount: activeByRole.OWNER,
        adminCount: activeByRole.ADMIN,
        siteManagerCount: activeByRole.SITE_MANAGER,
        supervisorCount: activeByRole.SUPERVISOR,
        unassignedAreasCount,
        areasWithInactiveSupervisorCount,
      },
      recentActivity: {
        days: RECENT_ACTIVITY_DAYS,
        commsInCount,
        commsOutCount,
        drawingsCount,
        documentsCount,
      },
      payments,
    };
  }
}
