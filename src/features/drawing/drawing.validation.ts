import { DrawingDirection } from "@prisma/client";
import { z } from "zod";

export class DrawingValidation {
  static readonly PARAMS = {
    projectId: z.object({
      projectId: z.string().min(1, "ID project wajib disertakan."),
    }),
    drawingId: z.object({
      id: z.string().min(1, "ID Drawing wajib disertakan."),
    }),
  };

  static readonly QUERY = {
    list: z.object({
      direction: z.nativeEnum(DrawingDirection).optional(),
      includeArchived: z
        .enum(["true", "false"])
        .optional()
        .transform((val) => val === "true"),
    }),
  };

  static readonly BODY = {
    create: z.object({
      direction: z.nativeEnum(DrawingDirection),
      storageKey: z.string().trim().min(1, "Kunci file Drawing wajib diisi.").max(500),
      fileName: z.string().trim().min(1, "Nama file Drawing wajib diisi.").max(255),
      mimeType: z.string().trim().min(1, "Tipe file Drawing wajib diisi.").max(100),
      sizeBytes: z.number().int().positive("Ukuran file Drawing harus lebih dari 0 byte."),
    }),
  };
}
