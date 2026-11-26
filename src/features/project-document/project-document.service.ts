import { StoragePurpose, StorageTargetType } from "@prisma/client";
import type { AuthenticatedUser } from "../../types/express.d.js";
import { logger } from "../../configs/logger.config.js";
import { ResponseError } from "../../utils/errors/response-error.util.js";
import { deleteDriveFile } from "../../utils/storage/drive-file.adapter.js";
import { ProjectRepository } from "../project/project.repository.js";
import { StoredFileService } from "../upload/stored-file.service.js";
import {
  assertDocumentProjectMutable,
  assertOwnerDocumentAccess,
  formatProjectDocumentItem,
} from "./project-document.helper.js";
import { ProjectDocumentRepository } from "./project-document.repository.js";
import type {
  CreateProjectDocumentDTO,
  ListProjectDocumentsQuery,
  ProjectDocumentItem,
} from "./project-document.type.js";

export class ProjectDocumentService {
  /** Mengambil daftar dokumen keluar project dengan path konten privat (US-19, BR-34). */
  static async listDocuments(
    actor: AuthenticatedUser,
    projectId: string,
    query: ListProjectDocumentsQuery,
  ): Promise<ProjectDocumentItem[]> {
    assertOwnerDocumentAccess(actor);
    const project = await ProjectRepository.findById(projectId);
    if (!project) throw new ResponseError("RESOURCE_NOT_FOUND", "Project tidak ditemukan.");

    const records = await ProjectDocumentRepository.findManyByProject({
      projectId,
      type: query.type,
    });
    return records.map(formatProjectDocumentItem);
  }

  /** Menyimpan file dokumen keluar (Quotation, BAST, Invoice) oleh OWNER (US-19, AC-19.1, BR-34). */
  static async createDocument(
    actor: AuthenticatedUser,
    projectId: string,
    dto: CreateProjectDocumentDTO,
  ): Promise<ProjectDocumentItem> {
    assertOwnerDocumentAccess(actor);
    const project = await ProjectRepository.findById(projectId);
    if (!project) throw new ResponseError("RESOURCE_NOT_FOUND", "Project tidak ditemukan.");
    assertDocumentProjectMutable(project);
    await StoredFileService.assertAttachable({
      storedFileId: dto.storedFileId, purpose: StoragePurpose.PROJECT_DOCUMENT,
      targetType: StorageTargetType.PROJECT, targetId: projectId,
      targetQualifier: dto.type, uploadedById: actor.id,
    });

    const created = await ProjectDocumentRepository.create({
      projectId,
      type: dto.type,
      storedFileId: dto.storedFileId,
    });
    return formatProjectDocumentItem(created);
  }

  /** Menghapus permanen dokumen keluar (objek storage + record DB) oleh OWNER (US-19, AC-19.1, BR-34). */
  static async deleteDocument(
    actor: AuthenticatedUser,
    documentId: string,
  ): Promise<{ id: string; deleted: true }> {
    assertOwnerDocumentAccess(actor);
    const existing = await ProjectDocumentRepository.findByIdWithProject(documentId);
    if (!existing || existing.project.deletedAt != null) {
      throw new ResponseError("RESOURCE_NOT_FOUND", "Dokumen keluar tidak ditemukan.");
    }
    assertDocumentProjectMutable(existing.project);

    const storedFileId = await ProjectDocumentRepository.deleteAndQueueFile(documentId);
    try {
      if (existing.storedFile.driveFileId) await deleteDriveFile(existing.storedFile.driveFileId);
      await ProjectDocumentRepository.markFileDeleted(storedFileId);
    } catch (error) {
      logger.warn("Project document Drive cleanup is pending", { storedFileId, error });
    }
    return { id: documentId, deleted: true };
  }
}
