import { UploadSessionPhotoStatus } from "@prisma/client";
import { prisma } from "../../configs/prisma-client.config.js";

export class UploadRepository {
  static async payeeExists(payeeId: string): Promise<boolean> {
    return Boolean(await prisma.externalPayee.findUnique({ where: { id: payeeId }, select: { id: true } }));
  }

  static async projectAcceptsFiles(projectId: string): Promise<boolean> {
    return Boolean(await prisma.project.findFirst({
      where: { id: projectId, deletedAt: null, archivedAt: null, completedAt: null, status: { not: "SELESAI" } },
      select: { id: true },
    }));
  }

  static async reportExists(reportId: string): Promise<boolean> {
    return Boolean(await prisma.dailyReport.findFirst({ where: { id: reportId, status: "SUBMITTED" }, select: { id: true } }));
  }

  static findAreaWithAssignments(areaId: string) {
    return prisma.area.findFirst({
      where: { id: areaId, deletedAt: null, project: { deletedAt: null } },
      select: {
        id: true,
        projectId: true,
        project: { select: { id: true, code: true } },
        assignments: { select: { supervisorId: true, startDate: true, endDate: true } },
      },
    });
  }

  static countReportSessionPhotos(sessionId: string) {
    return prisma.reportUploadSessionPhoto.count({
      where: { sessionId, status: { in: [UploadSessionPhotoStatus.PENDING, UploadSessionPhotoStatus.ATTACHED] } },
    });
  }
}
