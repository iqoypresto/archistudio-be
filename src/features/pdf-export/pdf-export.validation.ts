import { z } from "zod";

export const exportDailyReportPdfQuerySchema = z.object({
  projectId: z.string().uuid("Format projectId harus UUID"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD"),
});

export type ExportDailyReportPdfQuery = z.infer<typeof exportDailyReportPdfQuerySchema>;
