import { parseDateOnlyUtc } from "../../helpers/date.helper.js";
import { StoragePurpose, StorageTargetType } from "@prisma/client";
import type { AuthenticatedUser } from "../../types/express.d.js";
import { ResponseError } from "../../utils/errors/response-error.util.js";
import { StoredFileService } from "../upload/stored-file.service.js";
import { StoredFileRepository } from "../upload/stored-file.repository.js";
import {
  assertOwnerPaymentAccess,
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
  return formatPaymentRecord(record);
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
    return people.map((item) => formatPayeeItem(item));
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

  /** Mengambil daftar catatan pembayaran per orang beserta path konten bukti privat (US-17, BR-36). */
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
    return records.map(formatPaymentRecord);
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
    if (dto.proof) await StoredFileService.assertAttachable({
      storedFileId: dto.proof.storedFileId, purpose: StoragePurpose.PAYMENT_PROOF,
      targetType: StorageTargetType.PAYEE, targetId: personId, uploadedById: actor.id,
    });

    const created = await PaymentRepository.createRecord({
      payeeId: personId,
      status: dto.status,
      amount: dto.amount,
      recordDate: parseDateOnlyUtc(dto.recordDate),
      dueDate: dto.dueDate ? parseDateOnlyUtc(dto.dueDate) : null,
      proofStoredFileId: dto.proof?.storedFileId ?? null,
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
    if (dto.proof?.storedFileId && dto.proof.storedFileId !== existing.proofStoredFileId) {
      await StoredFileService.assertAttachable({
        storedFileId: dto.proof.storedFileId, purpose: StoragePurpose.PAYMENT_PROOF,
        targetType: StorageTargetType.PAYEE, targetId: existing.payeeId, uploadedById: actor.id,
      });
    }

    const updated = await PaymentRepository.updateRecord(recordId, {
      ...(dto.status && { status: dto.status }),
      ...(dto.amount !== undefined && { amount: dto.amount }),
      ...(dto.recordDate && { recordDate: parseDateOnlyUtc(dto.recordDate) }),
      ...(dto.dueDate !== undefined && {
        dueDate: dto.dueDate ? parseDateOnlyUtc(dto.dueDate) : null,
      }),
      ...(dto.proof !== undefined && {
        proofStoredFileId: dto.proof?.storedFileId ?? null,
      }),
    });
    if (dto.proof !== undefined && existing.proofStoredFileId && existing.proofStoredFileId !== (dto.proof?.storedFileId ?? null)) {
      await StoredFileRepository.markDeletePending(existing.proofStoredFileId);
    }
    return hydrateSingleRecord(updated);
  }
}
