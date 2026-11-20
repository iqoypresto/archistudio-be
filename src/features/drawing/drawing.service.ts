import type { AuthenticatedUser } from "../../types/express.d.js";
import { ResponseError } from "../../utils/errors/response-error.util.js";
import { StorageAdapter } from "../../utils/storage/storage.adapter.js";
import { ProjectRepository } from "../project/project.repository.js";
import {
  assertDrawingProjectMutable,
  assertOwnerDrawingAction,
  assertValidDrawingFile,
  formatDrawingItem,
} from "./drawing.helper.js";
import { DrawingRepository } from "./drawing.repository.js";
import type { CreateDrawingDTO, DrawingItem, ListDrawingsQuery } from "./drawing.type.js";

/** Memastikan role memiliki akses baca terhadap project (BR-03, BR-32, BR-40). */
async function assertCanReadProjectDrawings(
  actor: AuthenticatedUser,
  projectId: string,
): Promise<void> {
  if (actor.role === "SUPERVISOR") {
    const allowed = await ProjectRepository.findById(projectId, actor.id);
    if (allowed) return;
    const anyProject = await ProjectRepository.findById(projectId);
    if (!anyProject) throw new ResponseError("RESOURCE_NOT_FOUND", "Project tidak ditemukan.");
    throw new ResponseError(
      "AREA_SCOPE_FORBIDDEN",
      "Anda hanya dapat melihat Drawing pada project yang ditugaskan kepada Anda.",
    );
  }

  const project = await ProjectRepository.findById(projectId);
  if (!project) throw new ResponseError("RESOURCE_NOT_FOUND", "Project tidak ditemukan.");
}

export class DrawingService {
  /** Mengambil galeri Drawing project dengan signed GET URL sesuai scope role (US-18, BR-32). */
  static async listDrawings(
    actor: AuthenticatedUser,
    projectId: string,
    query: ListDrawingsQuery,
  ): Promise<DrawingItem[]> {
    await assertCanReadProjectDrawings(actor, projectId);
    const includeArchived = actor.role === "OWNER" && Boolean(query.includeArchived);
    const records = await DrawingRepository.findManyByProject({
      projectId,
      direction: query.direction,
      includeArchived,
    });
    const keys = records.map((item) => item.storageKey);
    const urlMap = keys.length > 0 ? await StorageAdapter.createSignedViewUrlsMap(keys) : {};

    return records.map((item) => formatDrawingItem(item, urlMap[item.storageKey] ?? ""));
  }

  /** Menyimpan Drawing baru oleh OWNER (US-18, AC-18.1, BR-32, BR-33). */
  static async createDrawing(
    actor: AuthenticatedUser,
    projectId: string,
    dto: CreateDrawingDTO,
  ): Promise<DrawingItem> {
    assertOwnerDrawingAction(actor, "Hanya Owner yang dapat mengunggah Drawing.");
    const project = await ProjectRepository.findById(projectId);
    if (!project) throw new ResponseError("RESOURCE_NOT_FOUND", "Project tidak ditemukan.");
    assertDrawingProjectMutable(project);
    assertValidDrawingFile(projectId, dto);

    const created = await DrawingRepository.create({
      projectId,
      direction: dto.direction,
      storageKey: dto.storageKey,
      fileName: dto.fileName,
      mimeType: dto.mimeType,
      sizeBytes: dto.sizeBytes,
    });
    const viewUrl = await StorageAdapter.createSignedViewUrl(created.storageKey);
    return formatDrawingItem(created, viewUrl);
  }

  /** Mengarsipkan Drawing oleh OWNER (US-18, AC-18.1, BR-32). */
  static async archiveDrawing(
    actor: AuthenticatedUser,
    drawingId: string,
    now = new Date(),
  ): Promise<DrawingItem> {
    assertOwnerDrawingAction(actor, "Hanya Owner yang dapat mengarsipkan Drawing.");
    const existing = await DrawingRepository.findByIdWithProject(drawingId);
    if (!existing || existing.project.deletedAt != null) {
      throw new ResponseError("RESOURCE_NOT_FOUND", "Drawing tidak ditemukan.");
    }
    assertDrawingProjectMutable(existing.project);
    if (existing.archivedAt != null) {
      throw new ResponseError("CONFLICT", "Drawing sudah diarsipkan.");
    }

    const updated = await DrawingRepository.markArchived(drawingId, now);
    const viewUrl = await StorageAdapter.createSignedViewUrl(updated.storageKey);
    return formatDrawingItem(updated, viewUrl);
  }
}
