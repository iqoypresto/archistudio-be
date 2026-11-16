import { prisma } from "../../configs/prisma-client.config.js";

export class ReportLockRepository {
  /** Mengambil daftar penugasan aktif supervisor beserta laporan dan riwayat buka kunci (BR-03, BR-08, BR-20). */
  static async findActiveAssignmentsForSupervisor(supervisorId: string) {
    return prisma.areaAssignment.findMany({
      where: {
        supervisorId,
        endDate: null,
        area: {
          deletedAt: null,
          project: { deletedAt: null },
        },
      },
      orderBy: [
        { area: { project: { name: "asc" } } },
        { area: { code: "asc" } },
      ],
      select: {
        id: true,
        startDate: true,
        endDate: true,
        area: {
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
            reports: {
              where: { archivedAt: null },
              select: {
                id: true,
                reportDate: true,
                status: true,
                supervisorId: true,
              },
            },
            unlocks: {
              orderBy: { unlockedThroughDate: "desc" },
              take: 1,
              select: { unlockedThroughDate: true },
            },
          },
        },
      },
    });
  }
}

export type ActiveAssignmentRecord = Awaited<
  ReturnType<typeof ReportLockRepository.findActiveAssignmentsForSupervisor>
>[number];
