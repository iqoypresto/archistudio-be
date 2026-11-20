import type { AuthenticatedUser } from "../../types/express.d.js";
import { ResponseError } from "../../utils/errors/response-error.util.js";
import { StorageAdapter } from "../../utils/storage/storage.adapter.js";
import { ProjectRepository } from "../project/project.repository.js";
import {
  assertDocumentProjectMutable,
  assertOwnerDocumentAccess,
  assertValidProjectDocumentFile,
  formatProjectDocumentItem,
} from "./project-document.helper.js";
import { ProjectDocumentRepository } from "./project-document.repository.js";
import type {
  CreateProjectDocumentDTO,
  ListProjectDocumentsQuery,
  ProjectDocumentItem,
} from "./project-document.type.js";

export class ProjectDocumentService {
  /** Mengambil daftar dokumen keluar project dengan signed GET/download URL (US-19, BR-34). */
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
    const keys = records.map((item) => item.storageKey);
    const urlMap = keys.length > 0 ? await StorageAdapter.createSignedViewUrlsMap(keys) : {};

    return records.map((item) => formatProjectDocumentItem(item, urlMap[item.storageKey] ?? ""));
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
    assertValidProjectDocumentFile(projectId, dto);

    const created = await ProjectDocumentRepository.create({
      projectId,
      type: dto.type,
      storageKey: dto.storageKey,
      fileName: dto.fileName,
      mimeType: dto.mimeType,
      sizeBytes: dto.sizeBytes,
    });
    const viewUrl = await StorageAdapter.createSignedViewUrl(created.storageKey);
    return formatProjectDocumentItem(created, viewUrl);
  }

  /** Menghapus permanen dokumen keluar (objek R2 + record DB) oleh OWNER (US-19, AC-19.1, BR-34). */
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

    await StorageAdapter.deleteObject(existing.storageKey);
    await ProjectDocumentRepository.deleteById(documentId);
    return { id: documentId, deleted: true };
  }
}
