import { ProjectDocumentType } from "@prisma/client";
import { z } from "zod";

export class ProjectDocumentValidation {
  static readonly PARAMS = {
    projectId: z.object({
      projectId: z.string().min(1, "ID project wajib disertakan."),
    }),
    documentId: z.object({
      id: z.string().min(1, "ID dokumen wajib disertakan."),
    }),
  };

  static readonly QUERY = {
    list: z.object({
      type: z.nativeEnum(ProjectDocumentType).optional(),
    }),
  };

  static readonly BODY = {
    create: z.object({
      type: z.nativeEnum(ProjectDocumentType),
      storageKey: z.string().trim().min(1, "Kunci file dokumen wajib diisi.").max(500),
      fileName: z.string().trim().min(1, "Nama file asli wajib diisi.").max(255),
      mimeType: z.string().trim().min(1, "Tipe file dokumen wajib diisi.").max(150),
      sizeBytes: z.number().int().positive("Ukuran file dokumen harus lebih dari 0 byte."),
    }),
  };
}
