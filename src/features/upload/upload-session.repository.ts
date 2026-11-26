import { DriveUploadSessionStatus, StoredFileStatus, UploadSessionPhotoStatus, type StoragePurpose, type StorageTargetType } from "@prisma/client";
import { prisma } from "../../configs/prisma-client.config.js";

export interface CreateStoredUploadInput {
  driveFolderId: string;
  purpose: StoragePurpose;
  targetType: StorageTargetType;
  targetId: string;
  targetQualifier: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedById: string;
  sessionUriCiphertext: string;
  expiresAt: Date;
  reportSessionId?: string;
}

export class UploadSessionRepository {
  static async claimExpiredBatch(now: Date, limit: number) {
    const candidates = await prisma.storedFile.findMany({
      where: {
        AND: [
          { OR: [
            { status: StoredFileStatus.DELETE_PENDING },
            { status: StoredFileStatus.UPLOADING, uploadSession: { is: { expiresAt: { lte: now } } } },
            { status: StoredFileStatus.READY, uploadSession: { is: { expiresAt: { lte: now } } } },
          ] },
          { OR: [
            { reportUploadSessionPhoto: null },
            { reportUploadSessionPhoto: { is: { status: UploadSessionPhotoStatus.DELETED } } },
          ] },
        ],
        reportPhoto: null,
        paymentRecord: null,
        drawing: null,
        projectDocument: null,
        commsEntry: null,
      },
      take: limit,
      orderBy: { updatedAt: "asc" },
      include: { uploadSession: true },
    });
    const claimed = [];
    for (const file of candidates) {
      if (file.status !== StoredFileStatus.DELETE_PENDING) {
        const result = await prisma.storedFile.updateMany({
          where: { id: file.id, status: file.status },
          data: { status: StoredFileStatus.DELETE_PENDING },
        });
        if (!result.count) continue;
        await prisma.driveUploadSession.updateMany({
          where: { storedFileId: file.id, status: DriveUploadSessionStatus.ACTIVE, expiresAt: { lte: now } },
          data: { status: DriveUploadSessionStatus.EXPIRED },
        });
      }
      claimed.push(file);
    }
    return claimed;
  }

  static markStoredFileDeleted(storedFileId: string) {
    return prisma.$transaction([
      prisma.storedFile.updateMany({ where: { id: storedFileId, status: StoredFileStatus.DELETE_PENDING }, data: { status: StoredFileStatus.DELETED } }),
      prisma.driveUploadSession.updateMany({
        where: { storedFileId, status: { in: [DriveUploadSessionStatus.CANCELLED, DriveUploadSessionStatus.EXPIRED, DriveUploadSessionStatus.FAILED] } },
        data: { sessionUriCiphertext: null },
      }),
    ]);
  }

  static create(input: CreateStoredUploadInput) {
    return prisma.$transaction(async (tx) => {
      const storedFile = await tx.storedFile.create({
        data: {
          driveFolderId: input.driveFolderId,
          purpose: input.purpose,
          targetType: input.targetType,
          targetId: input.targetId,
          targetQualifier: input.targetQualifier,
          fileName: input.fileName,
          mimeType: input.mimeType,
          sizeBytes: input.sizeBytes,
          uploadedById: input.uploadedById,
        },
      });
      const uploadSession = await tx.driveUploadSession.create({
        data: { storedFileId: storedFile.id, sessionUriCiphertext: input.sessionUriCiphertext, expiresAt: input.expiresAt },
      });
      if (input.reportSessionId) {
        await tx.reportUploadSessionPhoto.create({ data: { sessionId: input.reportSessionId, storedFileId: storedFile.id } });
      }
      return { storedFile, uploadSession };
    });
  }

  static findOwned(id: string, userId: string) {
    return prisma.driveUploadSession.findFirst({
      where: { id, storedFile: { uploadedById: userId } },
      include: { storedFile: true },
    });
  }

  static updateProgress(input: { id: string; expectedOffset: number; nextOffset: number; driveFileId?: string }) {
    return prisma.$transaction(async (tx) => {
      const result = await tx.driveUploadSession.updateMany({
        where: { id: input.id, status: DriveUploadSessionStatus.ACTIVE, nextOffsetBytes: input.expectedOffset },
        data: {
          nextOffsetBytes: input.nextOffset,
          ...(input.driveFileId && { status: DriveUploadSessionStatus.COMPLETED }),
        },
      });
      if (result.count && input.driveFileId) {
        const session = await tx.driveUploadSession.findUniqueOrThrow({ where: { id: input.id } });
        await tx.storedFile.update({ where: { id: session.storedFileId }, data: { driveFileId: input.driveFileId } });
      }
      return result.count === 1;
    });
  }

  static async hasDomainReference(storedFileId: string): Promise<boolean> {
    const file = await prisma.storedFile.findUnique({ where: { id: storedFileId }, select: {
      reportPhoto: { select: { id: true } }, paymentRecord: { select: { id: true } },
      drawing: { select: { id: true } }, projectDocument: { select: { id: true } },
      commsEntry: { select: { id: true } },
    } });
    return Boolean(file?.reportPhoto || file?.paymentRecord || file?.drawing || file?.projectDocument || file?.commsEntry);
  }

  static markDeleted(storedFileId: string) {
    return prisma.$transaction([
      prisma.storedFile.update({ where: { id: storedFileId }, data: { status: StoredFileStatus.DELETED } }),
      prisma.driveUploadSession.updateMany({ where: { storedFileId }, data: { sessionUriCiphertext: null } }),
    ]);
  }

  static markReady(id: string, uploadedAt: Date) {
    return prisma.$transaction(async (tx) => {
      const session = await tx.driveUploadSession.findUniqueOrThrow({ where: { id } });
      await tx.storedFile.update({
        where: { id: session.storedFileId },
        data: { status: StoredFileStatus.READY, uploadedAt },
      });
      return tx.driveUploadSession.update({
        where: { id },
        data: { status: DriveUploadSessionStatus.COMPLETED, sessionUriCiphertext: null },
      });
    });
  }

  static markCancelled(id: string) {
    return prisma.$transaction(async (tx) => {
      const session = await tx.driveUploadSession.findUniqueOrThrow({ where: { id } });
      await tx.storedFile.update({ where: { id: session.storedFileId }, data: { status: StoredFileStatus.DELETE_PENDING } });
      await tx.reportUploadSessionPhoto.updateMany({
        where: { storedFileId: session.storedFileId, status: UploadSessionPhotoStatus.PENDING },
        data: { status: UploadSessionPhotoStatus.DELETED },
      });
      return tx.driveUploadSession.update({
        where: { id },
        data: { status: DriveUploadSessionStatus.CANCELLED },
      });
    });
  }
}
