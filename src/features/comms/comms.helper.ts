import { CommsDirection, Prisma, ProjectStatus } from "@prisma/client";
import { canEditCommsEntry, isCommsAllowedRole } from "../../helpers/access-policy.helper.js";
import type { AuthenticatedUser } from "../../types/express.d.js";
import { ResponseError } from "../../utils/errors/response-error.util.js";
import type { CommsAttachmentInput, CommsEntryItem } from "./comms.type.js";

export const ALLOWED_COMMS_ATTACHMENT_MIMES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);
export const MAX_COMMS_ATTACHMENT_BYTES = 5 * 1024 * 1024;

export const COMMS_MESSAGES = {
  LIST_FETCHED: "Daftar catatan Comms berhasil diambil.",
  CREATED: "Catatan Comms berhasil ditambahkan.",
  UPDATED: "Catatan Comms berhasil diperbarui.",
} as const;

export const commsSelect = Prisma.validator<Prisma.CommsEntrySelect>()({
  id: true,
  projectId: true,
  direction: true,
  entryDate: true,
  subject: true,
  note: true,
  attachmentKey: true,
  attachmentName: true,
  attachmentMime: true,
  attachmentBytes: true,
  createdById: true,
  updatedById: true,
  createdBy: { select: { id: true, name: true, role: true } },
  updatedBy: { select: { id: true, name: true, role: true } },
  createdAt: true,
  updatedAt: true,
});

export const commsWithProjectSelect = Prisma.validator<Prisma.CommsEntrySelect>()({
  ...commsSelect,
  project: {
    select: {
      status: true,
      archivedAt: true,
      deletedAt: true,
    },
  },
});

export type RawCommsEntry = Prisma.CommsEntryGetPayload<{ select: typeof commsSelect }>;
export type RawCommsWithProject = Prisma.CommsEntryGetPayload<{
  select: typeof commsWithProjectSelect;
}>;

/** Memastikan role pengguna termasuk kebijakan akses modul Comms (BR-35, K-02). */
export function assertCommsRoleAccess(actor: AuthenticatedUser): void {
  if (!isCommsAllowedRole(actor.role)) {
    throw new ResponseError("FORBIDDEN", "Anda tidak memiliki akses ke modul Comms project.");
  }
}

/** Memastikan hanya pembuat catatan atau OWNER yang boleh mengubah entri Comms (BR-35, D-05). */
export function assertCanEditComms(actor: AuthenticatedUser, createdById: string): void {
  if (!canEditCommsEntry(actor, createdById)) {
    throw new ResponseError(
      "FORBIDDEN",
      "Hanya pembuat catatan atau Owner yang dapat mengubah catatan Comms ini.",
    );
  }
}

/** Menolak mutasi Comms bila project sudah selesai atau diarsipkan (BR-12, BR-39). */
export function assertCommsProjectMutable(project: {
  status: ProjectStatus;
  archivedAt?: Date | null;
}): void {
  if (project.status === ProjectStatus.SELESAI || project.archivedAt != null) {
    throw new ResponseError(
      "PROJECT_ALREADY_COMPLETED",
      "Project sudah selesai atau diarsipkan sehingga Comms bersifat baca saja.",
    );
  }
}

/** Memvalidasi lampiran opsional Comms (PDF/Word/Excel, maks. 5 MB, prefix valid) (BR-35). */
export function assertValidCommsAttachment(
  projectId: string,
  attachment?: CommsAttachmentInput | null,
): void {
  if (!attachment) return;
  if (!ALLOWED_COMMS_ATTACHMENT_MIMES.has(attachment.mimeType)) {
    throw new ResponseError(
      "UNSUPPORTED_FILE_TYPE",
      "Lampiran Comms hanya mendukung format PDF, Word, atau Excel (BR-35).",
    );
  }
  if (attachment.sizeBytes > MAX_COMMS_ATTACHMENT_BYTES) {
    throw new ResponseError(
      "FILE_TOO_LARGE",
      "Ukuran lampiran Comms maksimal 5 MB per file (BR-35).",
    );
  }
  const expectedPrefix = `projects/${projectId}/comms-attachments/`;
  if (!attachment.storageKey.startsWith(expectedPrefix) || attachment.storageKey.includes("..")) {
    throw new ResponseError("INVALID_STORAGE_KEY", "Referensi file lampiran Comms tidak valid.");
  }
}

export function formatCommsEntry(
  raw: RawCommsEntry,
  attachmentViewUrl: string | null,
): CommsEntryItem {
  return {
    id: raw.id,
    projectId: raw.projectId,
    direction: raw.direction as CommsDirection,
    entryDate: raw.entryDate.toISOString().slice(0, 10),
    subject: raw.subject,
    note: raw.note,
    attachmentKey: raw.attachmentKey,
    attachmentName: raw.attachmentName,
    attachmentMime: raw.attachmentMime,
    attachmentBytes: raw.attachmentBytes,
    attachmentViewUrl,
    createdBy: raw.createdBy,
    updatedBy: raw.updatedBy ?? null,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}
