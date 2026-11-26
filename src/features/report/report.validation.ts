import { ReportType, WeatherType } from "@prisma/client";
import { z } from "zod";
import { paginationQuerySchema } from "../../validations/pagination.validation.js";

const DATE_YYYY_MM_DD = /^\d{4}-\d{2}-\d{2}$/;

const photoInputSchema = z.object({
  storageKey: z.string().trim().min(1, "Storage key foto wajib diisi."),
  caption: z.string().trim().max(250).nullable().optional(),
  sortOrder: z.number().int().nonnegative(),
  takenAt: z.string().trim().max(40).nullable().optional(),
});

const reportContentSchema = z.object({
  reportType: z.nativeEnum(ReportType).optional(),
  progressText: z.string().trim().nullable().optional(),
  obstaclesText: z.string().trim().nullable().optional(),
  tomorrowPlanText: z.string().trim().nullable().optional(),
  weather: z.nativeEnum(WeatherType).nullable().optional(),
  workerCount: z.number().int().nonnegative().nullable().optional(),
  noWorkReason: z.string().trim().nullable().optional(),
  locationText: z.string().trim().max(250).nullable().optional(),
  photos: z.array(photoInputSchema).max(10).optional(),
});

export class ReportValidation {
  static readonly PARAMS = {
    id: z.object({
      id: z.string().uuid("ID laporan tidak valid."),
    }),
  };

  static readonly QUERY = {
    myObligations: paginationQuerySchema.extend({
      status: z.enum(["ALL", "LATE", "OVERDUE"]).default("ALL"),
    }),
    archive: paginationQuerySchema.extend({
      projectId: z.string().uuid().optional(),
      areaId: z.string().uuid().optional(),
      dateFrom: z.iso.date().optional(),
      dateTo: z.iso.date().optional(),
      sortBy: z.enum(["reportDate", "createdAt", "submittedAt"]).default("reportDate"),
    }).refine((query) => !query.dateFrom || !query.dateTo || query.dateFrom <= query.dateTo, {
      message: "Tanggal akhir harus sama atau setelah tanggal awal.", path: ["dateTo"],
    }),
    list: paginationQuerySchema.extend({
      projectId: z.string().uuid().optional(),
      areaId: z.string().uuid().optional(),
      supervisorId: z.string().uuid().optional(),
      scope: z.enum(["own", "team"]).optional(),
      reportDate: z.string().regex(DATE_YYYY_MM_DD).optional(),
      dateFrom: z.string().regex(DATE_YYYY_MM_DD).optional(),
      dateTo: z.string().regex(DATE_YYYY_MM_DD).optional(),
      reportType: z.nativeEnum(ReportType).optional(),
      isLate: z
        .enum(["true", "false"])
        .transform((val) => val === "true")
        .optional(),
      sortBy: z.enum(["reportDate", "createdAt", "submittedAt"]).default("reportDate"),
    }),
  };

  static readonly BODY = {
    submitNew: reportContentSchema.extend({
      sessionId: z.string().uuid(),
      areaId: z.string().uuid(),
      reportDate: z.iso.date(),
      reportType: z.nativeEnum(ReportType),
      photos: z.array(photoInputSchema).min(1).max(10),
    }),
    revise: reportContentSchema.extend({
      changeSummary: z
        .string()
        .trim()
        .min(3, "Ringkasan perubahan revisi minimal 3 karakter.")
        .max(500, "Ringkasan perubahan revisi maksimal 500 karakter."),
    }),
  };
}
