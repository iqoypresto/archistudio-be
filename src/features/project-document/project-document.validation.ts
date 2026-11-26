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
      storedFileId: z.string().uuid("ID file dokumen tidak valid."),
    }),
  };
}
