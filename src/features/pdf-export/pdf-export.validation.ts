import { z } from "zod";

export const exportDailyReportPdfQuerySchema = z.object({
  projectId: z.string().uuid("Format projectId harus UUID"),
  date: z.iso.date("Format tanggal harus tanggal valid YYYY-MM-DD"),
});

export type ExportDailyReportPdfQuery = z.infer<typeof exportDailyReportPdfQuerySchema>;
