import { StoredFileStatus } from "@prisma/client";
import { prisma } from "../../configs/prisma-client.config.js";

export class StoredFileRepository {
  static markDeletePending(id: string) {
    return prisma.storedFile.updateMany({ where: { id, status: StoredFileStatus.READY }, data: { status: StoredFileStatus.DELETE_PENDING } });
  }

  static findById(id: string) {
    return prisma.storedFile.findUnique({
      where: { id },
      select: {
        id: true, purpose: true, targetType: true, targetId: true, targetQualifier: true,
        fileName: true, mimeType: true, sizeBytes: true, status: true, uploadedById: true,
        uploadSession: { select: { status: true, expiresAt: true } },
        reportPhoto: { select: { id: true } }, paymentRecord: { select: { id: true } },
        drawing: { select: { id: true } }, projectDocument: { select: { id: true } },
        commsEntry: { select: { id: true } },
      },
    });
  }
}
