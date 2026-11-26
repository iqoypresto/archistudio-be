import { StoragePurpose, StorageTargetType } from "@prisma/client";
import type { AuthenticatedUser } from "../../types/express.d.js";
import { ResponseError } from "../../utils/errors/response-error.util.js";
import { ProjectRepository } from "../project/project.repository.js";
import { ProjectService } from "../project/project.service.js";
import { StoredFileService } from "../upload/stored-file.service.js";
import {
  assertDrawingProjectMutable,
  assertOwnerDrawingAction,
  formatDrawingItem,
} from "./drawing.helper.js";
import { DrawingRepository } from "./drawing.repository.js";
import type { CreateDrawingDTO, DrawingItem, ListDrawingsQuery } from "./drawing.type.js";

export class DrawingService {
  /** Mengambil galeri Drawing project dengan path konten privat sesuai scope role (US-18, BR-32). */
  static async listDrawings(
    actor: AuthenticatedUser,
    projectId: string,
    query: ListDrawingsQuery,
  ): Promise<DrawingItem[]> {
    await ProjectService.assertCanAccessProject(
      actor,
      projectId,
      "Anda hanya dapat melihat Drawing pada project yang ditugaskan kepada Anda.",
    );
    const includeArchived = actor.role === "OWNER" && Boolean(query.includeArchived);
    const records = await DrawingRepository.findManyByProject({
      projectId,
      includeArchived,
    });
    return records.map(formatDrawingItem);
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
    await StoredFileService.assertAttachable({
      storedFileId: dto.storedFileId, purpose: StoragePurpose.DRAWING,
      targetType: StorageTargetType.PROJECT, targetId: projectId, uploadedById: actor.id,
    });

    const created = await DrawingRepository.create({
      projectId,
      storedFileId: dto.storedFileId,
    });
    return formatDrawingItem(created);
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
    return formatDrawingItem(updated);
  }
}
