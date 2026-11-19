import { Role } from "@prisma/client";
import type { AuthenticatedUser } from "../../types/express.js";
import { ResponseError } from "../../utils/errors/response-error.util.js";
import {
  buildReportPhotoStorageKey,
  buildPurposeStorageKey,
  createSignedUploadUrl,
  createSignedViewUrlsMap,
} from "../../utils/storage/storage.adapter.js";
import { UploadRepository } from "./upload.repository.js";
import type {
  SignUploadBody,
  SignedPhotoViewItem,
  SignedUploadFileItem,
  ViewUrlsBody,
  PurposeUploadBody,
  SignedPurposeUploadItem,
} from "./upload.type.js";

const MIN_PHOTOS = 1;
const MAX_PHOTOS = 10;
const DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];
const IMAGE_MIME_TYPES = ["image/jpeg", "image/png"];
const DRAWING_MIME_TYPES = [...IMAGE_MIME_TYPES, "image/webp"];
const MAX_PURPOSE_BYTES: Record<PurposeUploadBody["purpose"], number> = {
  "payment-proof": 2 * 1024 * 1024,
  drawing: 4 * 1024 * 1024,
  "project-document": 5 * 1024 * 1024,
  "comms-attachment": 5 * 1024 * 1024,
};

function toDateOnlyString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Memastikan supervisor memiliki penugasan pada area & tanggal target (BR-03, BR-10). */
function assertSupervisorAreaScope(
  assignments: { supervisorId: string; startDate: Date; endDate: Date | null }[],
  supervisorId: string,
  reportDate: string,
): void {
  const ownAssignments = assignments.filter((a) => a.supervisorId === supervisorId);
  if (ownAssignments.length === 0) {
    throw new ResponseError("AREA_SCOPE_FORBIDDEN");
  }
  const hasValidWindow = ownAssignments.some((a) => {
    const start = toDateOnlyString(a.startDate);
    const end = a.endDate ? toDateOnlyString(a.endDate) : null;
    return reportDate >= start && (!end || reportDate <= end);
  });
  if (!hasValidWindow) {
    throw new ResponseError("ASSIGNMENT_ENDED");
  }
}

export class UploadService {
  /** Menghasilkan daftar presigned PUT URL ke Cloudflare R2 setelah validasi BR-03/10/16. */
  static async signUploadUrls(
    body: SignUploadBody,
    user: AuthenticatedUser,
  ): Promise<SignedUploadFileItem[] | SignedPurposeUploadItem> {
    if ("purpose" in body) return UploadService.signPurposeUploadUrl(body, user);
    return UploadService.signReportPhotoUrls(body, user);
  }

  private static async signReportPhotoUrls(
    body: Extract<SignUploadBody, { areaId: string }>,
    user: AuthenticatedUser,
  ): Promise<SignedUploadFileItem[]> {
    if (body.files.length < MIN_PHOTOS || body.files.length > MAX_PHOTOS) {
      throw new ResponseError("INVALID_PHOTO_COUNT");
    }
    const area = await UploadRepository.findAreaWithAssignments(body.areaId);
    if (!area) {
      throw new ResponseError("RESOURCE_NOT_FOUND");
    }
    if (user.role === Role.SUPERVISOR) {
      assertSupervisorAreaScope(area.assignments, user.id, body.reportDate);
    }
    return Promise.all(
      body.files.map((file) => {
        const storageKey = buildReportPhotoStorageKey({
          projectId: area.project.id,
          areaId: area.id,
          reportDate: body.reportDate,
          contentType: file.contentType,
        });
        return createSignedUploadUrl({ storageKey, contentType: file.contentType });
      }),
    );
  }

  /** Menghasilkan URL signed untuk berkas fase 2 setelah policy purpose dan target lolos. */
  private static async signPurposeUploadUrl(
    body: PurposeUploadBody,
    user: AuthenticatedUser,
  ): Promise<SignedPurposeUploadItem> {
    if (user.role !== Role.OWNER) throw new ResponseError("FORBIDDEN");
    assertPurposeFileAllowed(body);
    const referenceId = await resolveUploadReference(body);
    const storageKey = buildPurposeStorageKey({
      purpose: body.purpose,
      referenceId,
      category: "direction" in body ? body.direction : "type" in body ? body.type : undefined,
      contentType: body.file.contentType,
    });
    const signed = await createSignedUploadUrl({ storageKey, contentType: body.file.contentType });
    return { ...signed, purpose: body.purpose, ...body.file };
  }

  /** Menghasilkan presigned GET URL untuk galeri foto laporan sesuai cakupan role (BR-03). */
  static async getReportViewUrls(
    body: ViewUrlsBody,
    user: AuthenticatedUser,
  ): Promise<SignedPhotoViewItem[]> {
    const report = await UploadRepository.findReportWithPhotosAndScope(body.reportId);
    if (!report) {
      throw new ResponseError("RESOURCE_NOT_FOUND");
    }
    if (user.role === Role.SUPERVISOR) {
      const canAccess =
        report.supervisorId === user.id ||
        report.area.assignments.some((a) => a.supervisorId === user.id);
      if (!canAccess) throw new ResponseError("AREA_SCOPE_FORBIDDEN");
    }
    const urlMap = await createSignedViewUrlsMap(report.photos.map((p) => p.storageKey));
    return report.photos.map((photo) => ({
      photoId: photo.id,
      viewUrl: urlMap[photo.storageKey] ?? "",
      caption: photo.caption,
      sortOrder: photo.sortOrder,
    }));
  }
}

function assertPurposeFileAllowed(body: PurposeUploadBody): void {
  const allowedTypes = body.purpose === "drawing"
    ? DRAWING_MIME_TYPES
    : body.purpose === "payment-proof" ? IMAGE_MIME_TYPES : DOCUMENT_MIME_TYPES;
  if (!allowedTypes.includes(body.file.contentType)) throw new ResponseError("UNSUPPORTED_FILE_TYPE");
  if (body.file.fileSizeBytes > MAX_PURPOSE_BYTES[body.purpose]) throw new ResponseError("FILE_TOO_LARGE");
}

async function resolveUploadReference(body: PurposeUploadBody): Promise<string> {
  if (body.purpose === "payment-proof") {
    if (!(await UploadRepository.payeeExists(body.payeeId))) throw new ResponseError("RESOURCE_NOT_FOUND");
    return body.payeeId;
  }
  if (!(await UploadRepository.projectAcceptsFiles(body.projectId))) {
    throw new ResponseError("RESOURCE_NOT_FOUND", "Project tidak ditemukan atau sudah diarsipkan.");
  }
  return body.projectId;
}
