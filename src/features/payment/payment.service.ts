import { parseDateOnlyUtc } from "../../helpers/date.helper.js";
import type { AuthenticatedUser } from "../../types/express.d.js";
import { ResponseError } from "../../utils/errors/response-error.util.js";
import { StorageAdapter } from "../../utils/storage/storage.adapter.js";
import {
  assertOwnerPaymentAccess,
  assertValidPaymentProof,
  formatPayeeItem,
  formatPaymentRecord,
  type RawPaymentRecord,
} from "./payment.helper.js";
import { PaymentRepository } from "./payment.repository.js";
import type {
  CreatePayeeDTO,
  CreatePaymentRecordDTO,
  GetPaymentPeopleQuery,
  GetPaymentRecordsQuery,
  PaymentPayeeItem,
  PaymentRecordItem,
  UpdatePaymentRecordDTO,
} from "./payment.type.js";

async function hydrateSingleRecord(record: RawPaymentRecord): Promise<PaymentRecordItem> {
  const proofViewUrl = record.proofStorageKey
    ? await StorageAdapter.createSignedViewUrl(record.proofStorageKey)
    : null;
  return formatPaymentRecord(record, proofViewUrl);
}

export class PaymentService {
  /** Mengambil daftar penerima pembayaran global Freelance/Agent (US-17, BR-36). */
  static async getPeople(
    actor: AuthenticatedUser,
    query: GetPaymentPeopleQuery,
  ): Promise<PaymentPayeeItem[]> {
    assertOwnerPaymentAccess(actor);
    const people = await PaymentRepository.findPeople({
      type: query.type,
      search: query.search,
    });
    return people.map(formatPayeeItem);
  }

  /** Menambahkan orang (Freelance/Agent) baru tanpa relasi project (US-17, BR-36). */
  static async createPerson(
    actor: AuthenticatedUser,
    dto: CreatePayeeDTO,
  ): Promise<PaymentPayeeItem> {
    assertOwnerPaymentAccess(actor);
    const created = await PaymentRepository.createPerson({
      type: dto.type,
      name: dto.name,
      phone: dto.phone ?? null,
    });
    return formatPayeeItem(created);
  }

  /** Mengambil daftar catatan pembayaran per orang beserta signed proofViewUrl (US-17, BR-36). */
  static async getRecordsByPerson(
    actor: AuthenticatedUser,
    personId: string,
    query: GetPaymentRecordsQuery,
  ): Promise<PaymentRecordItem[]> {
    assertOwnerPaymentAccess(actor);
    const person = await PaymentRepository.findPersonById(personId);
    if (!person) {
      throw new ResponseError("RESOURCE_NOT_FOUND", "Data penerima pembayaran tidak ditemukan.");
    }

    const records = await PaymentRepository.findRecordsByPersonId(personId, query.status);
    const keys = records
      .map((item) => item.proofStorageKey)
      .filter((key): key is string => Boolean(key));
    const urlMap = keys.length > 0 ? await StorageAdapter.createSignedViewUrlsMap(keys) : {};

    return records.map((record) =>
      formatPaymentRecord(record, record.proofStorageKey ? (urlMap[record.proofStorageKey] ?? null) : null),
    );
  }

  /** Menambahkan catatan pembayaran baru untuk penerima terpilih (US-17, AC-17.1, BR-36). */
  static async createRecord(
    actor: AuthenticatedUser,
    personId: string,
    dto: CreatePaymentRecordDTO,
  ): Promise<PaymentRecordItem> {
    assertOwnerPaymentAccess(actor);
    const person = await PaymentRepository.findPersonById(personId);
    if (!person) {
      throw new ResponseError("RESOURCE_NOT_FOUND", "Data penerima pembayaran tidak ditemukan.");
    }
    assertValidPaymentProof(personId, dto.proof);

    const created = await PaymentRepository.createRecord({
      payeeId: personId,
      status: dto.status,
      amount: dto.amount,
      recordDate: parseDateOnlyUtc(dto.recordDate),
      dueDate: dto.dueDate ? parseDateOnlyUtc(dto.dueDate) : null,
      proofStorageKey: dto.proof?.storageKey ?? null,
      proofFileName: dto.proof?.fileName ?? null,
      proofMimeType: dto.proof?.mimeType ?? null,
      proofSizeBytes: dto.proof?.sizeBytes ?? null,
      createdById: actor.id,
    });
    return hydrateSingleRecord(created);
  }

  /** Memperbarui catatan pembayaran yang ada (status, nominal, tanggal, bukti) (US-17, BR-36). */
  static async updateRecord(
    actor: AuthenticatedUser,
    recordId: string,
    dto: UpdatePaymentRecordDTO,
  ): Promise<PaymentRecordItem> {
    assertOwnerPaymentAccess(actor);
    const existing = await PaymentRepository.findRecordById(recordId);
    if (!existing) {
      throw new ResponseError("RESOURCE_NOT_FOUND", "Catatan pembayaran tidak ditemukan.");
    }
    assertValidPaymentProof(existing.payeeId, dto.proof);

    const updated = await PaymentRepository.updateRecord(recordId, {
      ...(dto.status && { status: dto.status }),
      ...(dto.amount !== undefined && { amount: dto.amount }),
      ...(dto.recordDate && { recordDate: parseDateOnlyUtc(dto.recordDate) }),
      ...(dto.dueDate !== undefined && {
        dueDate: dto.dueDate ? parseDateOnlyUtc(dto.dueDate) : null,
      }),
      ...(dto.proof !== undefined && {
        proofStorageKey: dto.proof?.storageKey ?? null,
        proofFileName: dto.proof?.fileName ?? null,
        proofMimeType: dto.proof?.mimeType ?? null,
        proofSizeBytes: dto.proof?.sizeBytes ?? null,
      }),
    });
    return hydrateSingleRecord(updated);
  }
}
