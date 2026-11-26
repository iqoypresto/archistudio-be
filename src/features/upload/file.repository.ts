import { prisma } from "../../configs/prisma-client.config.js";

export class FileRepository {
  static findById(id: string) {
    return prisma.storedFile.findUnique({
      where: { id },
      include: {
        reportPhoto: { select: { report: { select: {
          supervisorId: true,
          area: { select: { assignments: { select: { supervisorId: true } }, project: { select: { siteManagerId: true } } } },
        } } } },
        paymentRecord: { select: { id: true } },
        drawing: { select: { projectId: true } },
        projectDocument: { select: { id: true } },
        commsEntry: { select: { projectId: true } },
      },
    });
  }
}
