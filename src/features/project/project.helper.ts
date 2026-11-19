import { ProjectStatus } from "@prisma/client";
import { toBusinessDateString } from "../../helpers/date.helper.js";
import type { AuthenticatedUser } from "../../types/express.d.js";
import { ResponseError } from "../../utils/errors/response-error.util.js";
import type { ArchivedProjectItem, ArchiveType, ProjectListItem } from "./project.type.js";

export const PROJECT_ARCHIVE_MESSAGES = {
  ARCHIVE_FETCHED: "Daftar arsip project berhasil diambil.",
  COMPLETED: "Project ditandai selesai dan dimasukkan ke Archive.",
  ARCHIVED: "Project berhasil diarsipkan secara manual ke Archive.",
  RESTORED: "Project berhasil dipulihkan dari Archive.",
} as const;

export function isProjectInArchive(project: {
  status: ProjectStatus;
  archivedAt?: Date | null;
}): boolean {
  return project.status === ProjectStatus.SELESAI || project.archivedAt != null;
}

/** Memastikan aksi selesai/arsip/pulih hanya dilakukan oleh OWNER (BR-39). */
export function assertOwnerProjectAction(actor: AuthenticatedUser, message: string): void {
  if (actor.role !== "OWNER") {
    throw new ResponseError("FORBIDDEN", message);
  }
}

/** Menolak mutasi project yang sudah selesai atau diarsipkan (BR-12, BR-39). */
export function assertProjectNotArchived(project: {
  status: ProjectStatus;
  archivedAt?: Date | null;
}): void {
  if (isProjectInArchive(project)) {
    throw new ResponseError(
      "PROJECT_ALREADY_COMPLETED",
      "Project sudah selesai atau diarsipkan dan bersifat baca saja hingga dipulihkan.",
    );
  }
}

/** Menghitung tahun folder Archive dari timestamp tindakan pada zona waktu project (BR-39). */
export function resolveActionYear(actionAt: Date, timezone: string): number {
  try {
    return Number(toBusinessDateString(actionAt, timezone).slice(0, 4));
  } catch {
    return actionAt.getUTCFullYear();
  }
}

/** Memetakan record project arsip menjadi ArchivedProjectItem dengan tahun & tipe arsip (BR-39). */
export function mapToArchivedProjectItem(project: ProjectListItem): ArchivedProjectItem {
  const isCompleted = project.status === ProjectStatus.SELESAI;
  const archiveType: ArchiveType = isCompleted ? "COMPLETED" : "MANUAL";
  const archivedActionAt = isCompleted
    ? (project.completedAt ?? project.updatedAt)
    : (project.archivedAt ?? project.updatedAt);

  return {
    ...project,
    archiveType,
    archiveYear: resolveActionYear(archivedActionAt, project.timezone),
    archivedActionAt,
  };
}
