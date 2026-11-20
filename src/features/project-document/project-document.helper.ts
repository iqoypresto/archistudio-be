import { Prisma, ProjectDocumentType, ProjectStatus } from "@prisma/client";
import type { AuthenticatedUser } from "../../types/express.d.js";
import { ResponseError } from "../../utils/errors/response-error.util.js";
import type { CreateProjectDocumentDTO, ProjectDocumentItem } from "./project-document.type.js";

export const ALLOWED_PROJECT_DOCUMENT_MIMES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);
export const MAX_PROJECT_DOCUMENT_BYTES = 5 * 1024 * 1024;

export const PROJECT_DOCUMENT_MESSAGES = {
  LIST_FETCHED: "Daftar dokumen keluar project berhasil diambil.",
  CREATED: "Dokumen keluar berhasil diunggah.",
  DELETED: "Dokumen keluar berhasil dihapus permanen.",
} as const;

export const projectDocumentSelect = Prisma.validator<Prisma.ProjectDocumentSelect>()({
  id: true,
  projectId: true,
  type: true,
  storageKey: true,
  fileName: true,
  mimeType: true,
  sizeBytes: true,
  uploadedAt: true,
});

export const projectDocumentWithProjectSelect = Prisma.validator<Prisma.ProjectDocumentSelect>()({
  ...projectDocumentSelect,
  project: {
    select: {
      status: true,
      archivedAt: true,
      deletedAt: true,
    },
  },
});

export type RawProjectDocument = Prisma.ProjectDocumentGetPayload<{
  select: typeof projectDocumentSelect;
}>;
export type RawProjectDocumentWithProject = Prisma.ProjectDocumentGetPayload<{
  select: typeof projectDocumentWithProjectSelect;
}>;

/** Memastikan dokumen keluar hanya diakses & dikelola oleh OWNER (BR-34). */
export function assertOwnerDocumentAccess(actor: AuthenticatedUser): void {
  if (actor.role !== "OWNER") {
    throw new ResponseError(
      "FORBIDDEN",
      "Dokumen keluar (Quotation, BAST, Invoice) hanya dapat diakses oleh Owner.",
    );
  }
}

/** Menolak mutasi dokumen keluar bila project sudah selesai atau diarsipkan (BR-12, BR-39). */
export function assertDocumentProjectMutable(project: {
  status: ProjectStatus;
  archivedAt?: Date | null;
}): void {
  if (project.status === ProjectStatus.SELESAI || project.archivedAt != null) {
    throw new ResponseError(
      "PROJECT_ALREADY_COMPLETED",
      "Project sudah selesai atau diarsipkan sehingga dokumen keluar bersifat baca saja.",
    );
  }
}

/** Memvalidasi MIME PDF/Word/Excel, ukuran <= 5 MB, dan prefix storageKey (BR-34). */
export function assertValidProjectDocumentFile(
  projectId: string,
  dto: CreateProjectDocumentDTO,
): void {
  if (!ALLOWED_PROJECT_DOCUMENT_MIMES.has(dto.mimeType)) {
    throw new ResponseError(
      "UNSUPPORTED_FILE_TYPE",
      "Dokumen keluar hanya mendukung format PDF, Word, atau Excel (BR-34).",
    );
  }
  if (dto.sizeBytes > MAX_PROJECT_DOCUMENT_BYTES) {
    throw new ResponseError(
      "FILE_TOO_LARGE",
      "Ukuran file dokumen keluar maksimal 5 MB per file (BR-34).",
    );
  }
  const expectedPrefix = `projects/${projectId}/documents/${dto.type}/`;
  if (!dto.storageKey.startsWith(expectedPrefix) || dto.storageKey.includes("..")) {
    throw new ResponseError("INVALID_STORAGE_KEY", "Referensi file dokumen keluar tidak valid.");
  }
}

export function formatProjectDocumentItem(
  raw: RawProjectDocument,
  viewUrl: string,
): ProjectDocumentItem {
  return {
    id: raw.id,
    projectId: raw.projectId,
    type: raw.type as ProjectDocumentType,
    storageKey: raw.storageKey,
    fileName: raw.fileName,
    mimeType: raw.mimeType,
    sizeBytes: raw.sizeBytes,
    uploadedAt: raw.uploadedAt,
    viewUrl,
  };
}
