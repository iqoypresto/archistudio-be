import { DriveUploadSessionStatus, StoragePurpose, StorageTargetType, StoredFileStatus } from "@prisma/client";
import { ResponseError } from "../../utils/errors/response-error.util.js";
import { StoredFileRepository } from "./stored-file.repository.js";

export interface StoredFileTarget {
  storedFileId: string;
  purpose: StoragePurpose;
  targetType: StorageTargetType;
  targetId: string;
  targetQualifier?: string | null;
  uploadedById: string;
}

export class StoredFileService {
  static async assertAttachable(target: StoredFileTarget): Promise<void> {
    const file = await StoredFileRepository.findById(target.storedFileId);
    const valid = file?.status === StoredFileStatus.READY && file.purpose === target.purpose &&
      file.uploadSession?.status === DriveUploadSessionStatus.COMPLETED && file.uploadSession.expiresAt > new Date() &&
      file.targetType === target.targetType && file.targetId === target.targetId &&
      (target.targetQualifier === undefined || file.targetQualifier === target.targetQualifier) &&
      file.uploadedById === target.uploadedById;
    if (!valid || StoredFileService.isLinked(file)) throw new ResponseError("INVALID_FILE_REFERENCE");
  }

  private static isLinked(file: Awaited<ReturnType<typeof StoredFileRepository.findById>>): boolean {
    return Boolean(file?.reportPhoto || file?.paymentRecord || file?.drawing || file?.projectDocument || file?.commsEntry);
  }
}
