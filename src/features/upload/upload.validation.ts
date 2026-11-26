import { ProjectDocumentType } from "@prisma/client";
import { z } from "zod";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const DATE_YYYY_MM_DD = /^\d{4}-\d{2}-\d{2}$/;
const fileSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  contentType: z.string().trim().min(1).max(160),
  fileSizeBytes: z.number().int().positive().max(MAX_FILE_BYTES),
});

export class UploadValidation {
  static readonly BODY = {
    fieldSession: z.object({
      reportSessionId: z.string().uuid(),
      areaId: z.string().uuid(),
      reportDate: z.string().regex(DATE_YYYY_MM_DD),
      file: fileSchema,
    }),
    officeSession: z.discriminatedUnion("purpose", [
      z.object({ purpose: z.literal("report-photo"), reportId: z.string().uuid(), file: fileSchema }),
      z.object({ purpose: z.literal("payment-proof"), payeeId: z.string().uuid(), file: fileSchema }),
      z.object({ purpose: z.literal("drawing"), projectId: z.string().uuid(), file: fileSchema }),
      z.object({ purpose: z.literal("project-document"), projectId: z.string().uuid(), type: z.nativeEnum(ProjectDocumentType), file: fileSchema }),
      z.object({ purpose: z.literal("comms-attachment"), projectId: z.string().uuid(), file: fileSchema }),
    ]),
    chunkParams: z.object({ uploadSessionId: z.string().uuid() }),
    contentParams: z.object({ storedFileId: z.string().uuid() }),
  };
}
