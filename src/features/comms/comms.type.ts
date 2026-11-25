import type { CommsDirection, Role } from "@prisma/client";
import type { z } from "zod";
import type { CommsValidation } from "./comms.validation.js";

export type ListCommsQuery = z.infer<typeof CommsValidation.QUERY.list>;
export type CreateCommsDTO = z.infer<typeof CommsValidation.BODY.create>;
export type UpdateCommsDTO = z.infer<typeof CommsValidation.BODY.update>;

export interface CommsAttachmentInput {
  storageKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface CommsActorSummary {
  id: string;
  name: string;
  role: Role;
}

export interface CommsEntryItem {
  id: string;
  projectId: string;
  direction: CommsDirection;
  entryDate: string;
  subject: string;
  note: string | null;
  attachmentKey: string | null;
  attachmentName: string | null;
  attachmentMime: string | null;
  attachmentBytes: number | null;
  attachmentViewUrl: string | null;
  createdBy: CommsActorSummary;
  updatedBy: CommsActorSummary | null;
  createdAt: Date;
  updatedAt: Date;
}
