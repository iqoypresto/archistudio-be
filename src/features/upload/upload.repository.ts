import { prisma } from "../../configs/prisma-client.config.js";

export class UploadRepository {
  /** Memastikan tujuan upload global pembayaran masih tersedia. */
  static async payeeExists(payeeId: string): Promise<boolean> {
    const payee = await prisma.externalPayee.findUnique({
      where: { id: payeeId },
      select: { id: true },
    });
    return Boolean(payee);
  }

  /** Mengambil project yang masih dapat menerima berkas baru. */
  static async projectAcceptsFiles(projectId: string): Promise<boolean> {
    return Boolean(
      await prisma.project.findFirst({
        where: {
          id: projectId,
          deletedAt: null,
          archivedAt: null,
          completedAt: null,
          status: { not: "SELESAI" },
        },
        select: { id: true },
      }),
    );
  }

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
            takenAt: true,
            uploadedAt: true,
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
