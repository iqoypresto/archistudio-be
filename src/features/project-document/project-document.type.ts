import type { ProjectDocumentType } from "@prisma/client";
import type { z } from "zod";
import type { ProjectDocumentValidation } from "./project-document.validation.js";

export type ListProjectDocumentsQuery = z.infer<typeof ProjectDocumentValidation.QUERY.list>;
export type CreateProjectDocumentDTO = z.infer<typeof ProjectDocumentValidation.BODY.create>;

export interface ProjectDocumentItem {
  id: string;
  projectId: string;
  type: ProjectDocumentType;
  storedFileId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: Date | null;
  contentPath: string;
}
