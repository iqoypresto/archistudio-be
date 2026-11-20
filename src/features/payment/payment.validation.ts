import { PayeeType, PaymentStatus } from "@prisma/client";
import { z } from "zod";

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const PHONE_REGEX = /^[0-9+\-\s()]{6,25}$/;

const paymentProofSchema = z.object({
  storageKey: z.string().trim().min(1, "Kunci file bukti wajib diisi.").max(500),
  fileName: z.string().trim().min(1, "Nama file bukti wajib diisi.").max(255),
  mimeType: z.string().trim().min(1, "Tipe file bukti wajib diisi.").max(100),
  sizeBytes: z.number().int().positive("Ukuran file bukti harus lebih dari 0 byte."),
});

export class PaymentValidation {
  static readonly QUERY = {
    getPeople: z.object({
      type: z.nativeEnum(PayeeType).optional(),
      search: z.string().trim().optional(),
    }),
    getRecords: z.object({
      status: z.nativeEnum(PaymentStatus).optional(),
    }),
  };

  static readonly PARAMS = {
    personId: z.object({
      personId: z.string().uuid("ID penerima pembayaran tidak valid."),
    }),
    recordId: z.object({
      id: z.string().uuid("ID catatan pembayaran tidak valid."),
    }),
  };

  static readonly BODY = {
    createPerson: z.object({
      type: z.nativeEnum(PayeeType),
      name: z.string().trim().min(1, "Nama wajib diisi.").max(120, "Nama maksimal 120 karakter."),
      phone: z
        .string()
        .trim()
        .regex(PHONE_REGEX, "Format nomor HP tidak valid.")
        .nullable()
        .optional()
        .or(z.literal("").transform(() => null)),
    }),

    createRecord: z.object({
      status: z.nativeEnum(PaymentStatus).default(PaymentStatus.UNPAID),
      amount: z.coerce
        .number()
        .finite("Nominal harus berupa angka yang valid.")
        .positive("Nominal pembayaran harus lebih dari 0."),
      recordDate: z.string().regex(DATE_REGEX, "Format tanggal catatan harus YYYY-MM-DD."),
      dueDate: z
        .string()
        .regex(DATE_REGEX, "Format jatuh tempo harus YYYY-MM-DD.")
        .nullable()
        .optional()
        .or(z.literal("").transform(() => null)),
      proof: paymentProofSchema.nullable().optional(),
    }),

    updateRecord: z
      .object({
        status: z.nativeEnum(PaymentStatus).optional(),
        amount: z.coerce
          .number()
          .finite("Nominal harus berupa angka yang valid.")
          .positive("Nominal pembayaran harus lebih dari 0.")
          .optional(),
        recordDate: z
          .string()
          .regex(DATE_REGEX, "Format tanggal catatan harus YYYY-MM-DD.")
          .optional(),
        dueDate: z
          .string()
          .regex(DATE_REGEX, "Format jatuh tempo harus YYYY-MM-DD.")
          .nullable()
          .optional()
          .or(z.literal("").transform(() => null)),
        proof: paymentProofSchema.nullable().optional(),
      })
      .refine(
        (data) => Object.keys(data).length > 0,
        "Setidaknya satu perubahan wajib disertakan.",
      ),
  };
}
