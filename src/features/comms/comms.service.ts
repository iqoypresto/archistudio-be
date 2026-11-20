import { parseDateOnlyUtc } from "../../helpers/date.helper.js";
import type { AuthenticatedUser } from "../../types/express.d.js";
import { ResponseError } from "../../utils/errors/response-error.util.js";
import { StorageAdapter } from "../../utils/storage/storage.adapter.js";
import { ProjectRepository } from "../project/project.repository.js";
import {
  assertCommsProjectMutable,
  assertOwnerCommsAccess,
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
  /** Mengambil daftar catatan Comms project beserta hydrated signed URL lampiran (US-20, BR-35). */
  static async listEntries(
    actor: AuthenticatedUser,
    projectId: string,
    query: ListCommsQuery,
  ): Promise<CommsEntryItem[]> {
    assertOwnerCommsAccess(actor);
    const project = await ProjectRepository.findById(projectId);
    if (!project) throw new ResponseError("RESOURCE_NOT_FOUND", "Project tidak ditemukan.");

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

  /** Membuat catatan Comms baru oleh OWNER (US-20, AC-20.1, BR-35). */
  static async createEntry(
    actor: AuthenticatedUser,
    projectId: string,
    dto: CreateCommsDTO,
  ): Promise<CommsEntryItem> {
    assertOwnerCommsAccess(actor);
    const project = await ProjectRepository.findById(projectId);
    if (!project) throw new ResponseError("RESOURCE_NOT_FOUND", "Project tidak ditemukan.");
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
    });
    return hydrateSingleEntry(created);
  }

  /** Memperbarui catatan Comms oleh OWNER (US-20, BR-35). */
  static async updateEntry(
    actor: AuthenticatedUser,
    commsId: string,
    dto: UpdateCommsDTO,
  ): Promise<CommsEntryItem> {
    assertOwnerCommsAccess(actor);
    const existing = await CommsRepository.findByIdWithProject(commsId);
    if (!existing || existing.project.deletedAt != null) {
      throw new ResponseError("RESOURCE_NOT_FOUND", "Catatan Comms tidak ditemukan.");
    }
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
    });
    return hydrateSingleEntry(updated);
  }
}
