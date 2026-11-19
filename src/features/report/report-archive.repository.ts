import { Prisma, ReportStatus } from "@prisma/client";
import { prisma } from "../../configs/prisma-client.config.js";

export class ReportArchiveRepository {
  /** Hanya timezone project dengan kandidat dalam scope request yang diperiksa. */
  static async findTimezones(scope: Prisma.DailyReportWhereInput) {
    const projects = await prisma.project.findMany({
      where: { areas: { some: { reports: { some: {
        AND: [scope, { status: ReportStatus.SUBMITTED, archivedAt: null }],
      } } } } },
      distinct: ["timezone"],
      select: { timezone: true },
    });
    return projects.map((project) => project.timezone);
  }

  /** Conditional update menjaga archivedAt pertama saat request berulang/bersamaan (BR-25). */
  static async archiveBefore(
    scope: Prisma.DailyReportWhereInput, timezone: string, today: Date, now: Date,
  ) {
    return prisma.dailyReport.updateMany({
      where: { AND: [scope, {
        status: ReportStatus.SUBMITTED,
        archivedAt: null,
        reportDate: { lt: today },
        area: { project: { timezone } },
      }] },
      data: { archivedAt: now },
    });
  }
}
