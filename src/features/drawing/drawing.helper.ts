import { Prisma, ProjectStatus } from "@prisma/client";
import type { AuthenticatedUser } from "../../types/express.d.js";
import { ResponseError } from "../../utils/errors/response-error.util.js";
import type { CreateDrawingDTO, DrawingItem } from "./drawing.type.js";

export const ALLOWED_DRAWING_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const MAX_DRAWING_BYTES = 4 * 1024 * 1024;

export const DRAWING_MESSAGES = {
  LIST_FETCHED: "Galeri Drawing berhasil diambil.",
  CREATED: "Drawing berhasil diunggah.",
  ARCHIVED: "Drawing berhasil diarsipkan.",
} as const;

export const drawingSelect = Prisma.validator<Prisma.DrawingSelect>()({
  id: true,
  projectId: true,
  storageKey: true,
  fileName: true,
  mimeType: true,
  sizeBytes: true,
  uploadedAt: true,
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

/** Memvalidasi format JPG/PNG/WebP, ukuran <= 4 MB, dan prefix storageKey Drawing (BR-33). */
export function assertValidDrawingFile(projectId: string, dto: CreateDrawingDTO): void {
  if (!ALLOWED_DRAWING_MIMES.has(dto.mimeType)) {
    throw new ResponseError(
      "UNSUPPORTED_FILE_TYPE",
      "Drawing hanya mendukung gambar JPG, PNG, atau WebP (BR-33).",
    );
  }
  if (dto.sizeBytes > MAX_DRAWING_BYTES) {
    throw new ResponseError(
      "FILE_TOO_LARGE",
      "Ukuran Drawing setelah kompresi maksimal 4 MB. Pilih gambar lain (BR-33).",
    );
  }
  const expectedPrefix = `projects/${projectId}/drawings/`;
  if (!dto.storageKey.startsWith(expectedPrefix) || dto.storageKey.includes("..")) {
    throw new ResponseError("INVALID_STORAGE_KEY", "Referensi file Drawing tidak valid.");
  }
}

export function formatDrawingItem(raw: RawDrawingRecord, viewUrl: string): DrawingItem {
  return {
    id: raw.id,
    projectId: raw.projectId,
    storageKey: raw.storageKey,
    fileName: raw.fileName,
    mimeType: raw.mimeType,
    sizeBytes: raw.sizeBytes,
    uploadedAt: raw.uploadedAt,
    archivedAt: raw.archivedAt,
    viewUrl,
  };
}
