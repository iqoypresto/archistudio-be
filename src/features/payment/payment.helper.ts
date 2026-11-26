import { PaymentStatus, Prisma } from "@prisma/client";
import { toBusinessDateString } from "../../helpers/date.helper.js";
import type { AuthenticatedUser } from "../../types/express.d.js";
import { ResponseError } from "../../utils/errors/response-error.util.js";
import type {
  PaymentPayeeItem,
  PaymentProofInput,
  PaymentRecordItem,
} from "./payment.type.js";

export const PAYMENT_PROOF_MIME_TYPES = new Set(["image/jpeg", "image/png"]);
export const MAX_PAYMENT_PROOF_BYTES = 2 * 1024 * 1024;

export const PAYMENT_MESSAGES = {
  PEOPLE_FETCHED: "Daftar penerima pembayaran berhasil diambil.",
  PERSON_CREATED: "Data penerima pembayaran berhasil ditambahkan.",
  RECORDS_FETCHED: "Daftar catatan pembayaran berhasil diambil.",
  RECORD_CREATED: "Catatan pembayaran berhasil ditambahkan.",
  RECORD_UPDATED: "Catatan pembayaran berhasil diperbarui.",
} as const;

export const payeeWithPaymentsSelect = Prisma.validator<Prisma.ExternalPayeeSelect>()({
  id: true,
  type: true,
  name: true,
  phone: true,
  createdAt: true,
  updatedAt: true,
  payments: {
    select: {
      status: true,
      amount: true,
      recordDate: true,
      dueDate: true,
    },
    orderBy: { recordDate: "desc" },
  },
});

export const paymentRecordSelect = Prisma.validator<Prisma.PaymentRecordSelect>()({
  id: true,
  payeeId: true,
  status: true,
  amount: true,
  recordDate: true,
  dueDate: true,
  proofStorageKey: true,
  proofFileName: true,
  proofMimeType: true,
  proofSizeBytes: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
});

export type RawPayeeRecord = Prisma.ExternalPayeeGetPayload<{
  select: typeof payeeWithPaymentsSelect;
}>;

export type RawPaymentRecord = Prisma.PaymentRecordGetPayload<{
  select: typeof paymentRecordSelect;
}>;

/** Memastikan seluruh aksi pembayaran hanya dapat diakses OWNER (BR-36). */
export function assertOwnerPaymentAccess(actor: AuthenticatedUser): void {
  if (actor.role !== "OWNER") {
    throw new ResponseError("FORBIDDEN", "Modul pembayaran Freelance/Agent hanya dapat diakses oleh Owner.");
  }
}

/** Memvalidasi metadata bukti pembayaran opsional (JPG/PNG, maks. 2 MB, prefix payee valid) (BR-36). */
export function assertValidPaymentProof(
  payeeId: string,
  proof?: PaymentProofInput | null,
): void {
  if (!proof) return;
  if (!PAYMENT_PROOF_MIME_TYPES.has(proof.mimeType)) {
    throw new ResponseError("UNSUPPORTED_FILE_TYPE", "Bukti pembayaran hanya mendukung format JPG atau PNG.");
  }
  if (proof.sizeBytes > MAX_PAYMENT_PROOF_BYTES) {
    throw new ResponseError("FILE_TOO_LARGE", "Ukuran bukti pembayaran maksimal 2 MB.");
  }
  const expectedPrefix = `payments/${payeeId}/proofs/`;
  if (!proof.storageKey.startsWith(expectedPrefix) || proof.storageKey.includes("..")) {
    throw new ResponseError("INVALID_STORAGE_KEY", "Referensi file bukti pembayaran tidak valid.");
  }
}

function toMoneyNumber(value: Prisma.Decimal | number): number {
  return Math.round(Number(value) * 100) / 100;
}

export function formatPayeeItem(raw: RawPayeeRecord, now = new Date()): PaymentPayeeItem {
  const todayStr = toBusinessDateString(now, "Asia/Jakarta");
  let paidCount = 0;
  let unpaidCount = 0;
  let totalPaid = 0;
  let totalUnpaid = 0;
  let overdueUnpaidCount = 0;
  let nearestDueDate: string | null = null;

  for (const item of raw.payments) {
    const amount = toMoneyNumber(item.amount);
    if (item.status === PaymentStatus.PAID) {
      paidCount += 1;
      totalPaid += amount;
    } else {
      unpaidCount += 1;
      totalUnpaid += amount;
      const dueStr = item.dueDate ? item.dueDate.toISOString().slice(0, 10) : null;
      if (dueStr) {
        if (dueStr < todayStr) overdueUnpaidCount += 1;
        if (!nearestDueDate || dueStr < nearestDueDate) nearestDueDate = dueStr;
      }
    }
  }

  return {
    id: raw.id,
    type: raw.type,
    name: raw.name,
    phone: raw.phone,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    summary: {
      recordCount: raw.payments.length,
      paidCount,
      unpaidCount,
      totalPaid: toMoneyNumber(totalPaid),
      totalUnpaid: toMoneyNumber(totalUnpaid),
      latestRecordDate: raw.payments[0]?.recordDate.toISOString().slice(0, 10) ?? null,
      overdueUnpaidCount,
      nearestDueDate,
    },
  };
}

export function formatPaymentRecord(
  raw: RawPaymentRecord,
  proofViewUrl: string | null,
): PaymentRecordItem {
  return {
    id: raw.id,
    payeeId: raw.payeeId,
    status: raw.status,
    amount: toMoneyNumber(raw.amount),
    recordDate: raw.recordDate.toISOString().slice(0, 10),
    dueDate: raw.dueDate ? raw.dueDate.toISOString().slice(0, 10) : null,
    proofStorageKey: raw.proofStorageKey,
    proofFileName: raw.proofFileName,
    proofMimeType: raw.proofMimeType,
    proofSizeBytes: raw.proofSizeBytes,
    proofViewUrl,
    createdById: raw.createdById,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}
