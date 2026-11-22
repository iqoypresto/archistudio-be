import { z } from "zod";

export const createReportUploadSessionSchema = z.object({
  areaId: z.string().uuid(),
  reportDate: z.iso.date(),
  reportId: z.string().uuid().optional(),
});

export const reportUploadSessionParamsSchema = z.object({
  sessionId: z.string().uuid(),
});

export const cleanupUploadSessionTokenSchema = z.string().min(32);
