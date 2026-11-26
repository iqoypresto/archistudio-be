import { DriveUploadSessionStatus, StoredFileStatus, StoragePurpose, StorageTargetType, UploadSessionPhotoStatus, UploadSessionStatus } from "@prisma/client";
import { prisma } from "../../configs/prisma-client.config.js";
import { buildPhotoCreateRows, REPORT_DETAIL_INCLUDE, type ReportMutationData } from "./report.prisma.js";
import type { ReportPhotoInput } from "./report.type.js";

export class ReportUploadSessionRepository {
  static create(input: { supervisorId: string; areaId: string; reportDate: Date; expiresAt: Date }) {
    return prisma.reportUploadSession.create({ data: input });
  }

  static findForSign(id: string, supervisorId: string, areaId: string, reportDate: Date) {
    return prisma.reportUploadSession.findFirst({ where: {
      id, supervisorId, areaId, reportDate, status: UploadSessionStatus.UPLOADING,
      expiresAt: { gt: new Date() },
    } });
  }

  static async renewForSign(id: string, supervisorId: string): Promise<boolean> {
    const result = await prisma.reportUploadSession.updateMany({
      where: { id, supervisorId, status: UploadSessionStatus.UPLOADING, expiresAt: { gt: new Date() } },
      data: { expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) },
    });
    return result.count === 1;
  }

  static async claimForFinalizing(id: string, supervisorId: string, now: Date): Promise<boolean> {
    const result = await prisma.reportUploadSession.updateMany({
      where: { id, supervisorId, status: { in: [UploadSessionStatus.UPLOADING, UploadSessionStatus.FINALIZING] }, expiresAt: { gt: now } },
      data: { status: UploadSessionStatus.FINALIZING, expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000) },
    });
    return result.count === 1;
  }

  static findOwned(id: string, supervisorId: string) {
    return prisma.reportUploadSession.findFirst({ where: { id, supervisorId }, include: { photos: { include: { storedFile: true } } } });
  }

  static async finalizeAndCreateReport(input: {
    sessionId: string;
    report: {
      reportNumber: string; areaId: string; supervisorId: string; reportDate: Date;
      data: ReportMutationData; photos: ReportPhotoInput[];
      submittedAt: Date; archivedAt: Date | null; isLate: boolean; signedByName: string; signedByTitle: string;
    };
  }) {
    const storedFileIds = input.report.photos.map((photo) => photo.storedFileId);
    return prisma.$transaction(async (tx) => {
      const session = await tx.reportUploadSession.findUniqueOrThrow({
        where: { id: input.sessionId }, include: { photos: { include: { storedFile: true } } },
      });
      const validPhotos = session.photos.filter((item) => item.status === UploadSessionPhotoStatus.PENDING &&
        item.storedFile.status === StoredFileStatus.READY && item.storedFile.purpose === StoragePurpose.REPORT_PHOTO &&
        item.storedFile.uploadedById === input.report.supervisorId &&
        item.storedFile.targetType === StorageTargetType.REPORT_UPLOAD_SESSION && item.storedFile.targetId === input.sessionId);
      if (!storedFileIds.length || storedFileIds.some((id) => !validPhotos.some((item) => item.storedFileId === id))) {
        return null;
      }
      const created = await tx.dailyReport.create({
        data: {
          reportNumber: input.report.reportNumber, areaId: input.report.areaId,
          supervisorId: input.report.supervisorId, reportDate: input.report.reportDate,
          status: "SUBMITTED", ...input.report.data,
          photos: { create: buildPhotoCreateRows(input.report.photos) },
          submittedAt: input.report.submittedAt, archivedAt: input.report.archivedAt,
          isLate: input.report.isLate, signedByName: input.report.signedByName,
          signedByTitle: input.report.signedByTitle,
        }, include: REPORT_DETAIL_INCLUDE,
      });
      await tx.reportUploadSessionPhoto.updateMany({
        where: { sessionId: input.sessionId, storedFileId: { in: storedFileIds } }, data: { status: UploadSessionPhotoStatus.ATTACHED },
      });
      await tx.reportUploadSession.update({ where: { id: input.sessionId }, data: { status: UploadSessionStatus.COMMITTED } });
      return created;
    });
  }

  static async cleanupBatch(now: Date, limit: number) {
    const candidates = await prisma.reportUploadSession.findMany({
      where: { expiresAt: { lte: now }, OR: [
        { status: { in: [UploadSessionStatus.UPLOADING, UploadSessionStatus.FINALIZING] } },
        { status: UploadSessionStatus.COMMITTED, photos: { some: { status: UploadSessionPhotoStatus.PENDING } } },
        { status: UploadSessionStatus.CLEANUP_PENDING },
      ] },
      take: limit, orderBy: { expiresAt: "asc" },
      include: { photos: { where: { status: UploadSessionPhotoStatus.PENDING }, include: { storedFile: { include: { uploadSession: true } } } } },
    });
    type Candidate = (typeof candidates)[number];
    const results: Array<{ sessionId: string; sessionStatus: UploadSessionStatus; photos: Candidate["photos"] }> = [];
    for (const session of candidates) {
      if (session.status !== UploadSessionStatus.COMMITTED && session.status !== UploadSessionStatus.CLEANUP_PENDING) {
        const claimed = await prisma.reportUploadSession.updateMany({
          where: { id: session.id, status: session.status, expiresAt: { lte: now } },
          data: { status: UploadSessionStatus.CLEANUP_PENDING },
        });
        if (!claimed.count) continue;
      }
      results.push({ sessionId: session.id, sessionStatus: session.status, photos: session.photos });
    }
    return results;
  }

  static async markPhotoDeleted(photoId: string, storedFileId: string) {
    return prisma.$transaction([
      prisma.reportUploadSessionPhoto.update({ where: { id: photoId }, data: { status: UploadSessionPhotoStatus.DELETED } }),
      prisma.storedFile.update({ where: { id: storedFileId }, data: { status: StoredFileStatus.DELETED } }),
      prisma.driveUploadSession.updateMany({ where: { storedFileId, status: DriveUploadSessionStatus.ACTIVE }, data: { status: DriveUploadSessionStatus.CANCELLED, sessionUriCiphertext: null } }),
    ]);
  }

  static markFileDeletePending(storedFileId: string) {
    return prisma.storedFile.updateMany({ where: { id: storedFileId }, data: { status: StoredFileStatus.DELETE_PENDING } });
  }

  static markCleaned(id: string) {
    return prisma.reportUploadSession.updateMany({
      where: { id, status: UploadSessionStatus.CLEANUP_PENDING },
      data: { status: UploadSessionStatus.CLEANED },
    });
  }

  static purgeOldCompleted(cutoff: Date) {
    return prisma.reportUploadSession.deleteMany({
      where: { status: { in: [UploadSessionStatus.CLEANED, UploadSessionStatus.COMMITTED] }, expiresAt: { lte: cutoff } },
    });
  }
}
