import { Prisma, ProjectStatus } from "@prisma/client";
import { canEditCommsEntry, isCommsAllowedRole } from "../../helpers/access-policy.helper.js";
import type { AuthenticatedUser } from "../../types/express.d.js";
import { ResponseError } from "../../utils/errors/response-error.util.js";
import type { CommsEntryItem } from "./comms.type.js";

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
  attachmentStoredFileId: true,
  attachment: { select: { fileName: true, mimeType: true, sizeBytes: true, uploadedAt: true } },
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

export function formatCommsEntry(raw: RawCommsEntry): CommsEntryItem {
  return {
    id: raw.id,
    projectId: raw.projectId,
    direction: raw.direction,
    entryDate: raw.entryDate.toISOString().slice(0, 10),
    subject: raw.subject,
    note: raw.note,
    attachmentStoredFileId: raw.attachmentStoredFileId,
    attachmentName: raw.attachment?.fileName ?? null,
    attachmentMime: raw.attachment?.mimeType ?? null,
    attachmentBytes: raw.attachment?.sizeBytes ?? null,
    attachmentUploadedAt: raw.attachment?.uploadedAt ?? null,
    attachmentContentPath: raw.attachmentStoredFileId
      ? `/files/${raw.attachmentStoredFileId}/content`
      : null,
    createdBy: raw.createdBy,
    updatedBy: raw.updatedBy ?? null,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}
