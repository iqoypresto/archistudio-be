import { parseDateOnlyUtc } from "../../helpers/date.helper.js";
import type { AuthenticatedUser } from "../../types/express.d.js";
import { ResponseError } from "../../utils/errors/response-error.util.js";
import { StorageAdapter } from "../../utils/storage/storage.adapter.js";
import { ProjectService } from "../project/project.service.js";
import {
  assertCanEditComms,
  assertCommsProjectMutable,
  assertCommsRoleAccess,
  assertValidCommsAttachment,
  formatCommsEntry,
  type RawCommsEntry,
} from "./comms.helper.js";
import { CommsRepository } from "./comms.repository.js";
import type {
  CommsEntryItem,
  CreateCommsDTO,
  ListCommsQuery,
  UpdateCommsDTO,
} from "./comms.type.js";

async function hydrateSingleEntry(entry: RawCommsEntry): Promise<CommsEntryItem> {
  const viewUrl = entry.attachmentKey
    ? await StorageAdapter.createSignedViewUrl(entry.attachmentKey)
    : null;
  return formatCommsEntry(entry, viewUrl);
}

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
    const keys = records
      .map((item) => item.attachmentKey)
      .filter((key): key is string => Boolean(key));
    const urlMap = keys.length > 0 ? await StorageAdapter.createSignedViewUrlsMap(keys) : {};

    return records.map((item) =>
      formatCommsEntry(item, item.attachmentKey ? (urlMap[item.attachmentKey] ?? null) : null),
    );
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
    assertValidCommsAttachment(projectId, dto.attachment);

    const created = await CommsRepository.create({
      projectId,
      direction: dto.direction,
      entryDate: parseDateOnlyUtc(dto.entryDate),
      subject: dto.subject,
      note: dto.note ?? null,
      attachmentKey: dto.attachment?.storageKey ?? null,
      attachmentName: dto.attachment?.fileName ?? null,
      attachmentMime: dto.attachment?.mimeType ?? null,
      attachmentBytes: dto.attachment?.sizeBytes ?? null,
      createdById: actor.id,
    });
    return hydrateSingleEntry(created);
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
    assertValidCommsAttachment(existing.projectId, dto.attachment);

    const updated = await CommsRepository.update(commsId, {
      ...(dto.entryDate && { entryDate: parseDateOnlyUtc(dto.entryDate) }),
      ...(dto.direction && { direction: dto.direction }),
      ...(dto.subject && { subject: dto.subject }),
      ...(dto.note !== undefined && { note: dto.note }),
      ...(dto.attachment !== undefined && {
        attachmentKey: dto.attachment?.storageKey ?? null,
        attachmentName: dto.attachment?.fileName ?? null,
        attachmentMime: dto.attachment?.mimeType ?? null,
        attachmentBytes: dto.attachment?.sizeBytes ?? null,
      }),
      updatedBy: { connect: { id: actor.id } },
    });
    return hydrateSingleEntry(updated);
  }
}
