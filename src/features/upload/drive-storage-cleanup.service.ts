import { logger } from "../../configs/logger.config.js";
import { cancelDriveUploadSession } from "../../utils/storage/drive-upload.adapter.js";
import { deleteDriveFile } from "../../utils/storage/drive-file.adapter.js";
import { decryptDriveSessionUri } from "../../utils/storage/drive-session.crypto.js";
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
        if (sessionUri) await cancelDriveUploadSession(decryptDriveSessionUri(sessionUri));
        if (file.driveFileId) await deleteDriveFile(file.driveFileId);
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
