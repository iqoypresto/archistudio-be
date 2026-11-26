import { Prisma, ProjectStatus } from "@prisma/client";
import type { AuthenticatedUser } from "../../types/express.d.js";
import { ResponseError } from "../../utils/errors/response-error.util.js";
import type { ProjectDocumentItem } from "./project-document.type.js";

export const PROJECT_DOCUMENT_MESSAGES = {
  LIST_FETCHED: "Daftar dokumen keluar project berhasil diambil.",
  CREATED: "Dokumen keluar berhasil diunggah.",
  DELETED: "Dokumen keluar berhasil dihapus permanen.",
} as const;

export const projectDocumentSelect = Prisma.validator<Prisma.ProjectDocumentSelect>()({
  id: true,
  projectId: true,
  type: true,
  storedFileId: true,
  storedFile: { select: { driveFileId: true, fileName: true, mimeType: true, sizeBytes: true, uploadedAt: true } },
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

export function formatProjectDocumentItem(raw: RawProjectDocument): ProjectDocumentItem {
  return {
    id: raw.id,
    projectId: raw.projectId,
    type: raw.type,
    storedFileId: raw.storedFileId,
    fileName: raw.storedFile.fileName,
    mimeType: raw.storedFile.mimeType,
    sizeBytes: raw.storedFile.sizeBytes,
    uploadedAt: raw.storedFile.uploadedAt,
    contentPath: `/files/${raw.storedFileId}/content`,
  };
}
