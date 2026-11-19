import { z } from "zod";

export const exportDailyReportPdfQuerySchema = z.object({
  projectId: z.string().uuid("Format projectId harus UUID"),
  date: z.iso.date("Format tanggal harus tanggal valid YYYY-MM-DD"),
});

export type ExportDailyReportPdfQuery = z.infer<typeof exportDailyReportPdfQuerySchema>;

export const exportMonthlyReportPdfQuerySchema = z.object({
  projectId: z.string().uuid(),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Format bulan harus YYYY-MM."),
});

export const exportDailyReportRangePdfQuerySchema = z.object({
  projectId: z.string().uuid(),
  fromDate: z.iso.date(),
  toDate: z.iso.date(),
}).refine((query) => query.toDate >= query.fromDate, {
  message: "Tanggal akhir harus sama atau setelah tanggal awal.", path: ["toDate"],
});

export type ExportMonthlyReportPdfQuery = z.infer<typeof exportMonthlyReportPdfQuerySchema>;
export type ExportDailyReportRangePdfQuery = z.infer<typeof exportDailyReportRangePdfQuerySchema>;
