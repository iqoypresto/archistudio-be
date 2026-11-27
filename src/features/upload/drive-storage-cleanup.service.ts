import { logger } from "../../configs/logger.config.js";
import { decryptDriveSessionUri } from "../../utils/storage/drive-session.crypto.js";
import { cancelAndDeleteDriveUpload } from "../../utils/storage/drive-cleanup.adapter.js";
import { UploadSessionRepository } from "./upload-session.repository.js";

const CLEANUP_BATCH_SIZE = 25;

export class DriveStorageCleanupService {
  static async cleanupExpiredAndPending(): Promise<{ filesDeleted: number; failures: number }> {
    const candidates = await UploadSessionRepository.claimExpiredBatch(new Date(), CLEANUP_BATCH_SIZE);
    let filesDeleted = 0;
    let failures = 0;

    for (const file of candidates) {
      try {
        const sessionUri = file.uploadSession?.sessionUriCiphertext;
        await cancelAndDeleteDriveUpload({
          sessionUri: sessionUri ? decryptDriveSessionUri(sessionUri) : null,
          driveFileId: file.driveFileId,
          sizeBytes: file.sizeBytes,
        });
        await UploadSessionRepository.markStoredFileDeleted(file.id);
        filesDeleted += 1;
      } catch (error) {
        logger.warn("Drive file cleanup is pending", { storedFileId: file.id, error });
        failures += 1;
      }
    }
    return { filesDeleted, failures };
  }
}
