import { prisma } from "../../configs/prisma-client.config.js";

export class UploadRepository {
  /** Mengambil data area beserta project dan daftar penugasan supervisor (BR-03, BR-10). */
  static async findAreaWithAssignments(areaId: string) {
    return prisma.area.findFirst({
      where: {
        id: areaId,
        deletedAt: null,
        project: { deletedAt: null },
      },
      select: {
        id: true,
        projectId: true,
        project: { select: { id: true, code: true } },
        assignments: {
          select: {
            id: true,
            supervisorId: true,
            startDate: true,
            endDate: true,
          },
        },
      },
    });
  }

  /** Mengambil laporan beserta foto dan cakupan penugasan area untuk signed view URLs. */
  static async findReportWithPhotosAndScope(reportId: string) {
    return prisma.dailyReport.findFirst({
      where: {
        id: reportId,
        archivedAt: null,
        area: { deletedAt: null, project: { deletedAt: null } },
      },
      select: {
        id: true,
        areaId: true,
        supervisorId: true,
        photos: {
          orderBy: { sortOrder: "asc" },
          select: {
            id: true,
            storageKey: true,
            caption: true,
            sortOrder: true,
          },
        },
        area: {
          select: {
            assignments: { select: { supervisorId: true } },
          },
        },
      },
    });
  }
}
