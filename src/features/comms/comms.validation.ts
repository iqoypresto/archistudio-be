import { CommsDirection } from "@prisma/client";
import { z } from "zod";

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const commsAttachmentSchema = z.object({
  storedFileId: z.string().uuid("Referensi lampiran tidak valid."),
});

export class CommsValidation {
  static readonly PARAMS = {
    projectId: z.object({
      projectId: z.string().min(1, "ID project wajib disertakan."),
    }),
    commsId: z.object({
      id: z.string().min(1, "ID catatan Comms wajib disertakan."),
    }),
  };

  static readonly QUERY = {
    list: z
      .object({
        dateFrom: z.string().regex(DATE_REGEX, "Format dateFrom harus YYYY-MM-DD.").optional(),
        dateTo: z.string().regex(DATE_REGEX, "Format dateTo harus YYYY-MM-DD.").optional(),
        direction: z.nativeEnum(CommsDirection).optional(),
        search: z.string().trim().optional(),
      })
      .refine(
        (data) => !(data.dateFrom && data.dateTo) || data.dateTo >= data.dateFrom,
        { message: "Tanggal akhir tidak boleh lebih awal dari tanggal awal.", path: ["dateTo"] },
      ),
  };

  static readonly BODY = {
    create: z.object({
      entryDate: z.string().regex(DATE_REGEX, "Format tanggal catatan harus YYYY-MM-DD."),
      direction: z.nativeEnum(CommsDirection),
      subject: z
        .string()
        .trim()
        .min(1, "Subjek komunikasi wajib diisi.")
        .max(200, "Subjek maksimal 200 karakter."),
      note: z
        .string()
        .trim()
        .max(2000, "Catatan singkat maksimal 2000 karakter.")
        .nullable()
        .optional()
        .or(z.literal("").transform(() => null)),
      attachment: commsAttachmentSchema.nullable().optional(),
    }),

    update: z
      .object({
        entryDate: z.string().regex(DATE_REGEX, "Format tanggal catatan harus YYYY-MM-DD.").optional(),
        direction: z.nativeEnum(CommsDirection).optional(),
        subject: z
          .string()
          .trim()
          .min(1, "Subjek komunikasi tidak boleh kosong.")
          .max(200, "Subjek maksimal 200 karakter.")
          .optional(),
        note: z
          .string()
          .trim()
          .max(2000, "Catatan singkat maksimal 2000 karakter.")
          .nullable()
          .optional()
          .or(z.literal("").transform(() => null)),
        attachment: commsAttachmentSchema.nullable().optional(),
      })
      .refine(
        (data) => Object.keys(data).length > 0,
        "Setidaknya satu perubahan wajib disertakan.",
      ),
  };
}
