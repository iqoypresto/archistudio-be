import type { AuthenticatedUser } from "../../types/express.js";
import { ResponseError } from "../../utils/errors/response-error.util.js";
import { StorageAdapter } from "../../utils/storage/storage.adapter.js";
import { ReportUploadSessionRepository } from "./report-upload-session.repository.js";
import { ReportRepository } from "./report.repository.js";
import { ReportStatus } from "@prisma/client";
import { assertAssignmentOnDate } from "./report.guard.js";

const SESSION_HOURS = 24;
const CLEANUP_BATCH = 25;

export class ReportUploadSessionService {
  static create(input: { areaId: string; reportDate: string; reportId?: string }, user: AuthenticatedUser) {
    return ReportUploadSessionService.createForAssignedArea(input, user);
  }

  private static async createForAssignedArea(input: { areaId: string; reportDate: string; reportId?: string }, user: AuthenticatedUser) {
    const area = await ReportRepository.findAreaContextForDraft(input.areaId);
    if (!area) throw new ResponseError("RESOURCE_NOT_FOUND");
    assertAssignmentOnDate(area.assignments, user.id, input.reportDate);
    let attachedStorageKeys: string[] = [];
    if (input.reportId) {
      const report = await ReportRepository.findReportDetailById(input.reportId);
      if (!report || report.supervisorId !== user.id || report.areaId !== input.areaId ||
        report.status !== ReportStatus.DRAFT || report.reportDate.toISOString().slice(0, 10) !== input.reportDate) {
        throw new ResponseError("AREA_SCOPE_FORBIDDEN");
      }
      attachedStorageKeys = report.photos.map((photo) => photo.storageKey);
    }
    return ReportUploadSessionRepository.create({
      supervisorId: user.id, areaId: input.areaId,
      reportDate: new Date(`${input.reportDate}T00:00:00.000Z`),
      expiresAt: new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000),
      attachedStorageKeys,
    });
  }

  static async assertCanSign(input: { sessionId: string; areaId: string; reportDate: string }, user: AuthenticatedUser) {
    const session = await ReportUploadSessionRepository.findForSign(
      input.sessionId, user.id, input.areaId, new Date(`${input.reportDate}T00:00:00.000Z`),
    );
    if (!session) throw new ResponseError("AREA_SCOPE_FORBIDDEN");
    if (!await ReportUploadSessionRepository.renewForSign(session.id, user.id)) {
      throw new ResponseError("AREA_SCOPE_FORBIDDEN");
    }
    return session;
  }

  static async cleanupExpired(): Promise<{ sessions: number; photosDeleted: number; failures: number }> {
    const batches = await ReportUploadSessionRepository.cleanupBatch(new Date(), CLEANUP_BATCH);
    let photosDeleted = 0;
    let failures = 0;
    for (const batch of batches) {
      let batchFailures = 0;
      for (const [index, key] of batch.keys.entries()) {
        try {
          await StorageAdapter.deleteObject(key);
          await ReportUploadSessionRepository.markPhotoDeleted(batch.photoIds[index]!);
          photosDeleted += 1;
        } catch {
          failures += 1;
          batchFailures += 1;
        }
      }
      if (!batchFailures && batch.sessionStatus !== "COMMITTED") {
        await ReportUploadSessionRepository.markCleaned(batch.sessionId);
      }
    }
    await ReportUploadSessionRepository.purgeOldCompleted(
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    );
    return { sessions: batches.length, photosDeleted, failures };
  }
}
