import type { DrawingDirection } from "@prisma/client";
import type { z } from "zod";
import type { DrawingValidation } from "./drawing.validation.js";

export type ListDrawingsQuery = z.infer<typeof DrawingValidation.QUERY.list>;
export type CreateDrawingDTO = z.infer<typeof DrawingValidation.BODY.create>;

export interface DrawingItem {
  id: string;
  projectId: string;
  direction: DrawingDirection;
  storageKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: Date;
  archivedAt: Date | null;
  viewUrl: string;
}
