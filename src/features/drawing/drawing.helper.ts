import { Prisma, ProjectStatus } from "@prisma/client";
import type { AuthenticatedUser } from "../../types/express.d.js";
import { ResponseError } from "../../utils/errors/response-error.util.js";
import type { DrawingItem } from "./drawing.type.js";

export const DRAWING_MESSAGES = {
  LIST_FETCHED: "Galeri Drawing berhasil diambil.",
  CREATED: "Drawing berhasil diunggah.",
  ARCHIVED: "Drawing berhasil diarsipkan.",
} as const;

export const drawingSelect = Prisma.validator<Prisma.DrawingSelect>()({
  id: true,
  projectId: true,
  storedFileId: true,
  storedFile: { select: { fileName: true, mimeType: true, sizeBytes: true, uploadedAt: true } },
  archivedAt: true,
});

export const drawingWithProjectSelect = Prisma.validator<Prisma.DrawingSelect>()({
  ...drawingSelect,
  project: {
    select: {
      status: true,
      archivedAt: true,
      deletedAt: true,
    },
  },
});

export type RawDrawingRecord = Prisma.DrawingGetPayload<{ select: typeof drawingSelect }>;
export type RawDrawingWithProject = Prisma.DrawingGetPayload<{
  select: typeof drawingWithProjectSelect;
}>;

/** Memastikan aksi unggah/arsip Drawing hanya dilakukan OWNER (BR-32). */
export function assertOwnerDrawingAction(actor: AuthenticatedUser, message: string): void {
  if (actor.role !== "OWNER") {
    throw new ResponseError("FORBIDDEN", message);
  }
}

/** Menolak mutasi Drawing bila project sudah selesai atau diarsipkan (BR-12, BR-39). */
export function assertDrawingProjectMutable(project: {
  status: ProjectStatus;
  archivedAt?: Date | null;
}): void {
  if (project.status === ProjectStatus.SELESAI || project.archivedAt != null) {
    throw new ResponseError(
      "PROJECT_ALREADY_COMPLETED",
      "Project sudah selesai atau diarsipkan sehingga Drawing bersifat baca saja.",
    );
  }
}

export function formatDrawingItem(raw: RawDrawingRecord): DrawingItem {
  return {
    id: raw.id,
    projectId: raw.projectId,
    storedFileId: raw.storedFileId,
    fileName: raw.storedFile.fileName,
    mimeType: raw.storedFile.mimeType,
    sizeBytes: raw.storedFile.sizeBytes,
    uploadedAt: raw.storedFile.uploadedAt,
    archivedAt: raw.archivedAt,
    contentPath: `/files/${raw.storedFileId}/content`,
  };
}
