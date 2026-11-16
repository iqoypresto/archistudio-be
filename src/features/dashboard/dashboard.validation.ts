import { z } from "zod";

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const dashboardSummaryQuerySchema = z.object({
  projectId: z.string().uuid("Format projectId harus UUID").optional(),
  date: z
    .string()
    .regex(DATE_REGEX, "Format tanggal harus YYYY-MM-DD")
    .optional(),
  statusFilter: z
    .enum(["ALL", "UNREPORTED", "LATE", "OVERDUE_GT_3_DAYS"])
    .default("ALL")
    .optional(),
});

export const supervisorLatenessQuerySchema = z.object({
  projectId: z.string().uuid("Format projectId harus UUID").optional(),
  dateFrom: z
    .string()
    .regex(DATE_REGEX, "Format tanggal dateFrom harus YYYY-MM-DD")
    .optional(),
  dateTo: z
    .string()
    .regex(DATE_REGEX, "Format tanggal dateTo harus YYYY-MM-DD")
    .optional(),
});

export type DashboardSummaryQuery = z.infer<typeof dashboardSummaryQuerySchema>;
export type SupervisorLatenessQuery = z.infer<typeof supervisorLatenessQuerySchema>;
