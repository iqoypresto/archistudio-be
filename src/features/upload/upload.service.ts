import { DriveUploadSessionStatus, Role, StoragePurpose, StorageTargetType, StoredFileStatus } from "@prisma/client";
import { env } from "../../configs/env.config.js";
import { logger } from "../../configs/logger.config.js";
import { isCommsAllowedRole } from "../../helpers/access-policy.helper.js";
import type { AuthenticatedUser } from "../../types/express.js";
import { ResponseError } from "../../utils/errors/response-error.util.js";
import { cancelDriveUploadSession, createDriveUploadSession, getDriveUploadOffset, sendDriveChunk } from "../../utils/storage/drive-upload.adapter.js";
import { assertDriveFileMatchesStoredFile, deleteDriveFile, downloadDriveFileBuffer, getDriveFileMetadata } from "../../utils/storage/drive-file.adapter.js";
import { decryptDriveSessionUri, encryptDriveSessionUri } from "../../utils/storage/drive-session.crypto.js";
import { hasExpectedFileSignature } from "../../utils/storage/file-signature.helper.js";
import { ProjectService } from "../project/project.service.js";
import { ReportUploadSessionService } from "../report/report-upload-session.service.js";
import { UploadRepository } from "./upload.repository.js";
import { UploadSessionRepository } from "./upload-session.repository.js";
import type { FieldUploadBody, OfficeUploadBody, UploadChunkRange, UploadInitBody, UploadSessionReceipt } from "./upload.type.js";

const MAX_CHUNK_BYTES = 4 * 1024 * 1024;
const APP_SESSION_HOURS = 24;
const ALLOWED_MIME: Record<StoragePurpose, string[]> = {
  REPORT_PHOTO: ["image/jpeg", "image/png", "image/webp"],
  PAYMENT_PROOF: ["image/jpeg", "image/png"],
  DRAWING: ["image/jpeg", "image/png", "image/webp"],
  PROJECT_DOCUMENT: ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  COMMS_ATTACHMENT: ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
};

function maximumFileSize(purpose: StoragePurpose): number {
  if (purpose === StoragePurpose.PAYMENT_PROOF) return 2 * 1024 * 1024;
  if (purpose === StoragePurpose.DRAWING) return 4 * 1024 * 1024;
  return 5 * 1024 * 1024;
}

function assertFileAllowed(file: { contentType: string; fileSizeBytes: number }, purpose: StoragePurpose): void {
  if (!ALLOWED_MIME[purpose].includes(file.contentType)) throw new ResponseError("UNSUPPORTED_FILE_TYPE");
  if (file.fileSizeBytes > maximumFileSize(purpose)) throw new ResponseError("FILE_TOO_LARGE");
}

function sanitizeFileName(value: string): string {
  return value.replace(/[\\/\u0000-\u001f\u007f]/g, "_").trim().slice(0, 255) || "upload";
}

function assertSupervisorScope(area: Awaited<ReturnType<typeof UploadRepository.findAreaWithAssignments>>, userId: string, reportDate: string): asserts area is NonNullable<typeof area> {
  if (!area) throw new ResponseError("RESOURCE_NOT_FOUND");
  const assignments = area.assignments.filter((item) => item.supervisorId === userId);
  const assigned = assignments.some((item) => reportDate >= item.startDate.toISOString().slice(0, 10) &&
    (!item.endDate || reportDate <= item.endDate.toISOString().slice(0, 10)));
  if (!assigned) throw new ResponseError(assignments.length ? "ASSIGNMENT_ENDED" : "AREA_SCOPE_FORBIDDEN");
}

async function resolveTarget(body: UploadInitBody, user: AuthenticatedUser) {
  if ("reportSessionId" in body) return UploadService.resolveReportTarget(body, user);
  return UploadService.resolveOfficeTarget(body, user);
}

export class UploadService {
  static async createSession(body: UploadInitBody, user: AuthenticatedUser): Promise<UploadSessionReceipt> {
    const target = await resolveTarget(body, user);
    assertFileAllowed(body.file, target.purpose);
    const fileName = sanitizeFileName(body.file.fileName);
    const sessionUri = await createDriveUploadSession({ fileName, mimeType: body.file.contentType, sizeBytes: body.file.fileSizeBytes });
    try {
      const expiresAt = new Date(Date.now() + APP_SESSION_HOURS * 60 * 60 * 1000);
      const stored = await UploadSessionRepository.create({
        driveFolderId: env.GOOGLE_DRIVE_FOLDER_ID!, purpose: target.purpose, targetType: target.targetType,
        targetId: target.targetId, targetQualifier: target.targetQualifier, fileName,
        mimeType: body.file.contentType, sizeBytes: body.file.fileSizeBytes, uploadedById: user.id,
        sessionUriCiphertext: encryptDriveSessionUri(sessionUri), expiresAt,
        ...(target.reportSessionId && { reportSessionId: target.reportSessionId }),
      });
      return {
        storedFileId: stored.storedFile.id, uploadSessionId: stored.uploadSession.id,
        chunkSizeBytes: MAX_CHUNK_BYTES, expiresAt: expiresAt.toISOString(), fileName,
        contentType: body.file.contentType, fileSizeBytes: body.file.fileSizeBytes,
      };
    } catch (error) {
      await cancelDriveUploadSession(sessionUri).catch(() => undefined);
      throw error;
    }
  }

  private static async resolveReportTarget(body: FieldUploadBody, user: AuthenticatedUser) {
    if (user.role !== Role.SUPERVISOR) throw new ResponseError("FORBIDDEN");
    const area = await UploadRepository.findAreaWithAssignments(body.areaId);
    assertSupervisorScope(area, user.id, body.reportDate);
    await ReportUploadSessionService.assertCanSign({ sessionId: body.reportSessionId, areaId: body.areaId, reportDate: body.reportDate }, user);
    if (await UploadRepository.countReportSessionPhotos(body.reportSessionId) >= 10) throw new ResponseError("INVALID_PHOTO_COUNT");
    return { purpose: StoragePurpose.REPORT_PHOTO, targetType: StorageTargetType.REPORT_UPLOAD_SESSION, targetId: body.reportSessionId, targetQualifier: null, reportSessionId: body.reportSessionId };
  }

  private static async resolveOfficeTarget(body: OfficeUploadBody, user: AuthenticatedUser) {
    const target = UploadService.officeTarget(body);
    if (body.purpose === "comms-attachment") {
      if (!isCommsAllowedRole(user.role)) throw new ResponseError("FORBIDDEN");
      await ProjectService.assertCanAccessProject(user, body.projectId);
    } else if (user.role !== Role.OWNER) throw new ResponseError("FORBIDDEN");
    await UploadService.assertOfficeTargetExists(body);
    return target;
  }

  private static officeTarget(body: OfficeUploadBody) {
    if (body.purpose === "report-photo") return { purpose: StoragePurpose.REPORT_PHOTO, targetType: StorageTargetType.REPORT, targetId: body.reportId, targetQualifier: null };
    if (body.purpose === "payment-proof") return { purpose: StoragePurpose.PAYMENT_PROOF, targetType: StorageTargetType.PAYEE, targetId: body.payeeId, targetQualifier: null };
    if (body.purpose === "drawing") return { purpose: StoragePurpose.DRAWING, targetType: StorageTargetType.PROJECT, targetId: body.projectId, targetQualifier: null };
    if (body.purpose === "project-document") return { purpose: StoragePurpose.PROJECT_DOCUMENT, targetType: StorageTargetType.PROJECT, targetId: body.projectId, targetQualifier: body.type };
    return { purpose: StoragePurpose.COMMS_ATTACHMENT, targetType: StorageTargetType.PROJECT, targetId: body.projectId, targetQualifier: null };
  }

  private static async assertOfficeTargetExists(body: OfficeUploadBody): Promise<void> {
    const exists = body.purpose === "report-photo"
      ? await UploadRepository.reportExists(body.reportId)
      : body.purpose === "payment-proof"
        ? await UploadRepository.payeeExists(body.payeeId)
        : await UploadRepository.projectAcceptsFiles(body.projectId);
    if (!exists) throw new ResponseError("RESOURCE_NOT_FOUND");
  }

  static async uploadChunk(id: string, user: AuthenticatedUser, rangeHeader: string | undefined, bytes: Buffer) {
    const session = await UploadService.loadOwnedSession(id, user);
    const range = UploadService.parseRange(rangeHeader, bytes, session.storedFile.sizeBytes);
    if (range.start !== session.nextOffsetBytes) throw new ResponseError("UPLOAD_OFFSET_CONFLICT");
    const uri = UploadService.sessionUri(session.sessionUriCiphertext);
    const result = await sendDriveChunk({ sessionUri: uri, bytes, ...range });
    const nextOffsetBytes = result.complete ? range.total : result.nextOffsetBytes;
    const updated = await UploadSessionRepository.updateProgress({
      id, expectedOffset: range.start, nextOffset: nextOffsetBytes,
      ...(result.complete && result.file.id && { driveFileId: result.file.id }),
    });
    if (!updated) throw new ResponseError("UPLOAD_OFFSET_CONFLICT");
    return { nextOffsetBytes, status: result.complete ? DriveUploadSessionStatus.COMPLETED : DriveUploadSessionStatus.ACTIVE };
  }

  static async getStatus(id: string, user: AuthenticatedUser) {
    const session = await UploadService.loadOwnedSession(id, user);
    if (session.status === DriveUploadSessionStatus.COMPLETED) return UploadService.statusResponse(session, session.storedFile.sizeBytes);
    const uri = UploadService.sessionUri(session.sessionUriCiphertext);
    const result = await getDriveUploadOffset(uri, session.storedFile.sizeBytes);
    const nextOffsetBytes = result.complete ? session.storedFile.sizeBytes : result.nextOffsetBytes;
    const updated = await UploadSessionRepository.updateProgress({
      id, expectedOffset: session.nextOffsetBytes, nextOffset: nextOffsetBytes,
      ...(result.complete && result.file.id && { driveFileId: result.file.id }),
    });
    if (!updated && nextOffsetBytes !== session.nextOffsetBytes) throw new ResponseError("UPLOAD_OFFSET_CONFLICT");
    return { status: result.complete ? DriveUploadSessionStatus.COMPLETED : DriveUploadSessionStatus.ACTIVE, nextOffsetBytes, totalBytes: session.storedFile.sizeBytes, expiresAt: session.expiresAt.toISOString() };
  }

  private static statusResponse(session: NonNullable<Awaited<ReturnType<typeof UploadSessionRepository.findOwned>>>, nextOffsetBytes: number) {
    return { status: session.status, nextOffsetBytes, totalBytes: session.storedFile.sizeBytes, expiresAt: session.expiresAt.toISOString() };
  }

  static async complete(id: string, user: AuthenticatedUser) {
    let session = await UploadService.loadOwnedSession(id, user);
    if (session.status !== DriveUploadSessionStatus.COMPLETED) {
      const current = await UploadService.getStatus(id, user);
      if (current.nextOffsetBytes !== session.storedFile.sizeBytes) throw new ResponseError("UPLOAD_OFFSET_CONFLICT");
      session = await UploadService.loadOwnedSession(id, user);
    }
    const fileId = session.storedFile.driveFileId;
    if (!fileId) throw new ResponseError("INVALID_FILE_REFERENCE");
    const metadata = await getDriveFileMetadata(fileId);
    assertDriveFileMatchesStoredFile(metadata, session.storedFile);
    const bytes = await downloadDriveFileBuffer(fileId, session.storedFile.sizeBytes);
    if (bytes.byteLength !== session.storedFile.sizeBytes || !hasExpectedFileSignature(session.storedFile.mimeType, bytes)) {
      throw new ResponseError("UNSUPPORTED_FILE_TYPE");
    }
    const uploadedAt = new Date();
    await UploadSessionRepository.markReady(id, uploadedAt);
    return {
      storedFileId: session.storedFileId, uploadSessionId: id, fileName: session.storedFile.fileName,
      contentType: session.storedFile.mimeType, fileSizeBytes: session.storedFile.sizeBytes,
      uploadedAt: uploadedAt.toISOString(),
    };
  }

  static async cancel(id: string, user: AuthenticatedUser): Promise<void> {
    const session = await UploadService.loadOwnedSession(id, user, true);
    if (await UploadSessionRepository.hasDomainReference(session.storedFileId)) throw new ResponseError("INVALID_FILE_REFERENCE");
    await UploadSessionRepository.markCancelled(id);
    try {
      if (session.sessionUriCiphertext) await cancelDriveUploadSession(decryptDriveSessionUri(session.sessionUriCiphertext));
      if (session.storedFile.driveFileId) await deleteDriveFile(session.storedFile.driveFileId);
      await UploadSessionRepository.markDeleted(session.storedFileId);
    } catch (error) {
      logger.warn("Drive cleanup is pending", { storedFileId: session.storedFileId, error });
    }
  }

  private static async loadOwnedSession(id: string, user: AuthenticatedUser, allowExpired = false) {
    const session = await UploadSessionRepository.findOwned(id, user.id);
    if (!session) throw new ResponseError("RESOURCE_NOT_FOUND");
    if (session.expiresAt <= new Date() && !allowExpired) throw new ResponseError("UPLOAD_SESSION_EXPIRED");
    if (session.status === DriveUploadSessionStatus.EXPIRED && !allowExpired) throw new ResponseError("UPLOAD_SESSION_EXPIRED");
    if (session.storedFile.status !== StoredFileStatus.UPLOADING && session.storedFile.status !== StoredFileStatus.READY && !allowExpired) {
      throw new ResponseError("INVALID_FILE_REFERENCE");
    }
    return session;
  }

  private static sessionUri(value: string | null): string {
    if (!value) throw new ResponseError("UPLOAD_SESSION_EXPIRED");
    return decryptDriveSessionUri(value);
  }

  private static parseRange(header: string | undefined, bytes: Buffer, total: number): UploadChunkRange {
    const match = header?.match(/^bytes (\d+)-(\d+)\/(\d+)$/);
    if (!match) throw new ResponseError("VALIDATION_ERROR", "Header Content-Range tidak valid.");
    const range = { start: Number(match[1]), end: Number(match[2]), total: Number(match[3]) };
    const length = range.end - range.start + 1;
    if (range.total !== total || bytes.byteLength !== length || length < 1 || length > MAX_CHUNK_BYTES || range.end >= total) {
      throw new ResponseError("UPLOAD_OFFSET_CONFLICT");
    }
    if (range.end + 1 < total && (length !== MAX_CHUNK_BYTES || length % (256 * 1024) !== 0)) {
      throw new ResponseError("VALIDATION_ERROR", "Chunk non-final harus berukuran 4 MiB.");
    }
    return range;
  }
}
