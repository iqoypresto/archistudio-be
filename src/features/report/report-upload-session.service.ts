import { UploadSessionStatus } from "@prisma/client";
import type { AuthenticatedUser } from "../../types/express.js";
import { logger } from "../../configs/logger.config.js";
import { ResponseError } from "../../utils/errors/response-error.util.js";
import { cancelAndDeleteDriveUpload } from "../../utils/storage/drive-cleanup.adapter.js";
import { decryptDriveSessionUri } from "../../utils/storage/drive-session.crypto.js";
import { ReportUploadSessionRepository } from "./report-upload-session.repository.js";
import { ReportRepository } from "./report.repository.js";
import { assertAssignmentOnDate } from "./report.guard.js";

const SESSION_HOURS = 24;
const CLEANUP_BATCH = 25;

export class ReportUploadSessionService {
  static create(input: { areaId: string; reportDate: string }, user: AuthenticatedUser) {
    return ReportUploadSessionService.createForAssignedArea(input, user);
  }

  private static async createForAssignedArea(input: { areaId: string; reportDate: string }, user: AuthenticatedUser) {
    const area = await ReportRepository.findAreaContextForSubmit(input.areaId);
    if (!area) throw new ResponseError("RESOURCE_NOT_FOUND");
    assertAssignmentOnDate(area.assignments, user.id, input.reportDate);
    return ReportUploadSessionRepository.create({
      supervisorId: user.id, areaId: input.areaId,
      reportDate: new Date(`${input.reportDate}T00:00:00.000Z`),
      expiresAt: new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000),
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

  static async cancel(sessionId: string, user: AuthenticatedUser) {
    const status = await ReportUploadSessionRepository.requestCancellation(sessionId, user.id);
    if (!status) throw new ResponseError("RESOURCE_NOT_FOUND");
    if (status === UploadSessionStatus.COMMITTED || status === UploadSessionStatus.FINALIZING) {
      throw new ResponseError("INVALID_FILE_REFERENCE", "Laporan sudah terkirim atau sedang disimpan.");
    }
    if (status === UploadSessionStatus.CLEANED) return { cancelled: true, photosDeleted: 0, cleanupPending: false };

    const photos = await ReportUploadSessionRepository.findPendingPhotos(sessionId);
    let photosDeleted = 0;
    let failures = 0;
    for (const photo of photos) {
      try {
        const file = photo.storedFile;
        const encryptedUri = file.uploadSession?.sessionUriCiphertext;
        await cancelAndDeleteDriveUpload({
          sessionUri: encryptedUri ? decryptDriveSessionUri(encryptedUri) : null,
          driveFileId: file.driveFileId,
          sizeBytes: file.sizeBytes,
        });
        await ReportUploadSessionRepository.markPhotoDeleted(photo.id, file.id);
        photosDeleted += 1;
      } catch (error) {
        await ReportUploadSessionRepository.markFileDeletePending(photo.storedFile.id);
        logger.warn("Cancelled report photo cleanup is pending", { storedFileId: photo.storedFile.id, error });
        failures += 1;
      }
    }
    if (!failures) await ReportUploadSessionRepository.markCleaned(sessionId);
    return { cancelled: true, photosDeleted, cleanupPending: failures > 0 };
  }

  static async cleanupExpired(): Promise<{ sessions: number; photosDeleted: number; failures: number }> {
    const batches = await ReportUploadSessionRepository.cleanupBatch(new Date(), CLEANUP_BATCH);
    let photosDeleted = 0;
    let failures = 0;
    for (const batch of batches) {
      let batchFailures = 0;
      for (const photo of batch.photos) {
        try {
          const file = photo.storedFile;
          const sessionUri = file.uploadSession?.sessionUriCiphertext;
          await cancelAndDeleteDriveUpload({
            sessionUri: sessionUri ? decryptDriveSessionUri(sessionUri) : null,
            driveFileId: file.driveFileId,
            sizeBytes: file.sizeBytes,
          });
          await ReportUploadSessionRepository.markPhotoDeleted(photo.id, file.id);
          photosDeleted += 1;
        } catch (error) {
          await ReportUploadSessionRepository.markFileDeletePending(photo.storedFile.id);
          logger.warn("Expired report photo cleanup is pending", { storedFileId: photo.storedFile.id, error });
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
