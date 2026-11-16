import { z } from "zod";

const MAX_COMPRESSED_BYTES = 5 * 1024 * 1024;
const DATE_YYYY_MM_DD = /^\d{4}-\d{2}-\d{2}$/;

export class UploadValidation {
  static readonly BODY = {
    sign: z.object({
      areaId: z.string().uuid("ID area tidak valid."),
      reportDate: z
        .string()
        .regex(DATE_YYYY_MM_DD, "Format tanggal laporan harus YYYY-MM-DD."),
      files: z.array(
        z.object({
          contentType: z.string().trim().min(1, "Tipe file wajib diisi."),
          fileSizeBytes: z
            .number()
            .int()
            .positive("Ukuran file harus lebih dari 0 byte.")
            .max(
              MAX_COMPRESSED_BYTES,
              "Ukuran file terkompresi maksimal 5 MB per foto.",
            ),
        }),
      ),
    }),
    viewUrls: z.object({
      reportId: z.string().uuid("ID laporan tidak valid."),
    }),
  };
}
