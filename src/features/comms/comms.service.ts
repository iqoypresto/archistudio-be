import { parseDateOnlyUtc } from "../../helpers/date.helper.js";
import type { AuthenticatedUser } from "../../types/express.d.js";
import { ResponseError } from "../../utils/errors/response-error.util.js";
import { ProjectService } from "../project/project.service.js";
import { StoredFileService } from "../upload/stored-file.service.js";
import { StoredFileRepository } from "../upload/stored-file.repository.js";
import { StoragePurpose, StorageTargetType } from "@prisma/client";
import {
  assertCanEditComms,
  assertCommsProjectMutable,
  assertCommsRoleAccess,
  formatCommsEntry,
} from "./comms.helper.js";
import { CommsRepository } from "./comms.repository.js";
import type {
  CommsEntryItem,
  CreateCommsDTO,
  ListCommsQuery,
  UpdateCommsDTO,
} from "./comms.type.js";

export class CommsService {
  /** Mengambil daftar catatan Comms In/Out project sesuai scope role (US-20, BR-35, D-06, K-02). */
  static async listEntries(
    actor: AuthenticatedUser,
    projectId: string,
    query: ListCommsQuery,
  ): Promise<CommsEntryItem[]> {
    assertCommsRoleAccess(actor);
    await ProjectService.assertCanAccessProject(
      actor,
      projectId,
      "Anda hanya dapat mengakses Comms pada project yang ditugaskan kepada Anda.",
    );

    const records = await CommsRepository.findManyByProject({
      projectId,
      dateFrom: query.dateFrom ? parseDateOnlyUtc(query.dateFrom) : undefined,
      dateTo: query.dateTo ? parseDateOnlyUtc(query.dateTo) : undefined,
      direction: query.direction,
      search: query.search,
    });
    return records.map(formatCommsEntry);
  }

  /** Membuat catatan Comms baru oleh role yang diizinkan sesuai scope project (US-20, BR-35, D-05). */
  static async createEntry(
    actor: AuthenticatedUser,
    projectId: string,
    dto: CreateCommsDTO,
  ): Promise<CommsEntryItem> {
    assertCommsRoleAccess(actor);
    const project = await ProjectService.assertCanAccessProject(
      actor,
      projectId,
      "Anda hanya dapat menambahkan Comms pada project yang ditugaskan kepada Anda.",
    );
    assertCommsProjectMutable(project);
    if (dto.attachment) await CommsService.assertAttachment(projectId, dto.attachment.storedFileId, actor.id);

    const created = await CommsRepository.create({
      projectId,
      direction: dto.direction,
      entryDate: parseDateOnlyUtc(dto.entryDate),
      subject: dto.subject,
      note: dto.note ?? null,
      attachmentStoredFileId: dto.attachment?.storedFileId ?? null,
      createdById: actor.id,
    });
    return formatCommsEntry(created);
  }

  /** Memperbarui catatan Comms: hanya pembuat sendiri atau OWNER (US-20, BR-35, D-05). */
  static async updateEntry(
    actor: AuthenticatedUser,
    commsId: string,
    dto: UpdateCommsDTO,
  ): Promise<CommsEntryItem> {
    assertCommsRoleAccess(actor);
    const existing = await CommsRepository.findByIdWithProject(commsId);
    if (!existing || existing.project.deletedAt != null) {
      throw new ResponseError("RESOURCE_NOT_FOUND", "Catatan Comms tidak ditemukan.");
    }
    await ProjectService.assertCanAccessProject(
      actor,
      existing.projectId,
      "Anda hanya dapat mengubah Comms pada project yang ditugaskan kepada Anda.",
    );
    assertCanEditComms(actor, existing.createdById);
    assertCommsProjectMutable(existing.project);
    if (dto.attachment?.storedFileId && dto.attachment.storedFileId !== existing.attachmentStoredFileId) {
      await CommsService.assertAttachment(existing.projectId, dto.attachment.storedFileId, actor.id);
    }

    const updated = await CommsRepository.update(commsId, {
      ...(dto.entryDate && { entryDate: parseDateOnlyUtc(dto.entryDate) }),
      ...(dto.direction && { direction: dto.direction }),
      ...(dto.subject && { subject: dto.subject }),
      ...(dto.note !== undefined && { note: dto.note }),
      ...(dto.attachment !== undefined && {
        attachmentStoredFileId: dto.attachment?.storedFileId ?? null,
      }),
      updatedBy: { connect: { id: actor.id } },
    });
    if (dto.attachment !== undefined && existing.attachmentStoredFileId &&
      existing.attachmentStoredFileId !== (dto.attachment?.storedFileId ?? null)) {
      await StoredFileRepository.markDeletePending(existing.attachmentStoredFileId);
    }
    return formatCommsEntry(updated);
  }

  private static async assertAttachment(projectId: string, storedFileId: string, uploadedById: string): Promise<void> {
    await StoredFileService.assertAttachable({
      storedFileId,
      purpose: StoragePurpose.COMMS_ATTACHMENT,
      targetType: StorageTargetType.PROJECT,
      targetId: projectId,
      targetQualifier: null,
      uploadedById,
    });
  }
}
