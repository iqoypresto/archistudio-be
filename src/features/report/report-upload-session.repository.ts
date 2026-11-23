import { UploadSessionPhotoStatus, UploadSessionStatus } from "@prisma/client";
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

  static async addPhoto(sessionId: string, storageKey: string): Promise<void> {
    const count = await prisma.reportUploadSessionPhoto.count({ where: { sessionId } });
    if (count >= 50) throw new Error("Batas percobaan upload sesi tercapai.");
    await prisma.reportUploadSessionPhoto.create({ data: { sessionId, storageKey } });
  }

  static async claimForFinalizing(id: string, supervisorId: string, now: Date): Promise<boolean> {
    const result = await prisma.reportUploadSession.updateMany({
      where: { id, supervisorId, status: { in: [UploadSessionStatus.UPLOADING, UploadSessionStatus.FINALIZING] }, expiresAt: { gt: now } },
      data: { status: UploadSessionStatus.FINALIZING, expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000) },
    });
    return result.count === 1;
  }

  static findOwned(id: string, supervisorId: string) {
    return prisma.reportUploadSession.findFirst({ where: { id, supervisorId }, include: { photos: true } });
  }

  static async finalizeAndCreateReport(input: {
    sessionId: string; report: {
      reportNumber: string; areaId: string; supervisorId: string; reportDate: Date;
      data: ReportMutationData; photos: ReportPhotoInput[];
      submittedAt: Date; archivedAt: Date | null; isLate: boolean; signedByName: string; signedByTitle: string;
    };
  }) {
    const photoKeys = input.report.photos.map((photo) => photo.storageKey);
    return prisma.$transaction(async (tx) => {
      const session = await tx.reportUploadSession.findUniqueOrThrow({ where: { id: input.sessionId }, include: { photos: true } });
      if (!session.photos.length || photoKeys.some((key) => !session.photos.some((item) => item.storageKey === key))) {
        throw new Error("Foto laporan tidak cocok dengan sesi upload.");
      }
      const created = await tx.dailyReport.create({
        data: {
          reportNumber: input.report.reportNumber, areaId: input.report.areaId,
          supervisorId: input.report.supervisorId, reportDate: input.report.reportDate,
          status: "SUBMITTED", ...input.report.data,
          photos: { create: buildPhotoCreateRows(input.report.photos, input.report.supervisorId) },
          submittedAt: input.report.submittedAt, archivedAt: input.report.archivedAt,
          isLate: input.report.isLate, signedByName: input.report.signedByName,
          signedByTitle: input.report.signedByTitle,
        }, include: REPORT_DETAIL_INCLUDE,
      });
      await tx.reportUploadSessionPhoto.updateMany({
        where: { sessionId: input.sessionId, storageKey: { in: photoKeys } }, data: { status: "ATTACHED" },
      });
      await tx.reportUploadSession.update({ where: { id: input.sessionId }, data: { status: "COMMITTED" } });
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
      take: limit, orderBy: { expiresAt: "asc" }, include: { photos: { where: { status: UploadSessionPhotoStatus.PENDING } } },
    });
    const results: { sessionId: string; sessionStatus: UploadSessionStatus; photoIds: string[]; keys: string[] }[] = [];
    for (const session of candidates) {
      if (session.status !== UploadSessionStatus.COMMITTED && session.status !== UploadSessionStatus.CLEANUP_PENDING) {
        const claimed = await prisma.reportUploadSession.updateMany({
          where: { id: session.id, status: session.status, expiresAt: { lte: now } },
          data: { status: UploadSessionStatus.CLEANUP_PENDING },
        });
        if (!claimed.count) continue;
      }
      results.push({ sessionId: session.id, sessionStatus: session.status, photoIds: session.photos.map((photo) => photo.id), keys: session.photos.map((photo) => photo.storageKey) });
    }
    return results;
  }

  static markPhotoDeleted(id: string) {
    return prisma.reportUploadSessionPhoto.update({ where: { id }, data: { status: UploadSessionPhotoStatus.DELETED } });
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
