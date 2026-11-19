import { z } from "zod";
import { DrawingDirection, ProjectDocumentType } from "@prisma/client";

const MAX_COMPRESSED_BYTES = 5 * 1024 * 1024;
const DATE_YYYY_MM_DD = /^\d{4}-\d{2}-\d{2}$/;

export class UploadValidation {
  static readonly BODY = {
    sign: z.union([
      z.object({
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
      z.discriminatedUnion("purpose", [
        z.object({
          purpose: z.literal("payment-proof"),
          payeeId: z.string().uuid("ID penerima pembayaran tidak valid."),
          file: z.object({
            fileName: z.string().trim().min(1).max(255),
            contentType: z.string().trim().min(1),
            fileSizeBytes: z.number().int().positive(),
          }),
        }),
        z.object({
          purpose: z.literal("drawing"),
          projectId: z.string().uuid("ID project tidak valid."),
          direction: z.nativeEnum(DrawingDirection),
          file: z.object({
            fileName: z.string().trim().min(1).max(255),
            contentType: z.string().trim().min(1),
            fileSizeBytes: z.number().int().positive(),
          }),
        }),
        z.object({
          purpose: z.literal("project-document"),
          projectId: z.string().uuid("ID project tidak valid."),
          type: z.nativeEnum(ProjectDocumentType),
          file: z.object({
            fileName: z.string().trim().min(1).max(255),
            contentType: z.string().trim().min(1),
            fileSizeBytes: z.number().int().positive(),
          }),
        }),
        z.object({
          purpose: z.literal("comms-attachment"),
          projectId: z.string().uuid("ID project tidak valid."),
          file: z.object({
            fileName: z.string().trim().min(1).max(255),
            contentType: z.string().trim().min(1),
            fileSizeBytes: z.number().int().positive(),
          }),
        }),
      ]),
    ]),
    viewUrls: z.object({
      reportId: z.string().uuid("ID laporan tidak valid."),
    }),
  };
}
