import { describe, expect, it } from "vitest";
import { calculateMonthlyAreaMetrics, type PeriodProject } from "../src/features/pdf-export/pdf-export-period.helper.js";
import { PdfExportPeriodService } from "../src/features/pdf-export/pdf-export-period.service.js";
import { monthlyReportDefinition, rangeReportDefinition } from "../src/features/pdf-export/pdf-export-period.template.js";
import { exportDailyReportRangePdfQuerySchema, exportMonthlyReportPdfQuerySchema } from "../src/features/pdf-export/pdf-export.validation.js";

const project = {
  code: "VLA01", name: "Villa Canggu", startDate: new Date("2026-11-02T00:00:00Z"), endDate: new Date("2026-11-04T00:00:00Z"),
  routineHolidays: [0, 6], areas: [{ id: "a1", code: "A", name: "Struktur",
    assignments: [{ startDate: new Date("2026-11-02T00:00:00Z"), endDate: null }], reports: [
      { reportDate: new Date("2026-11-02T00:00:00Z"), isLate: false },
      { reportDate: new Date("2026-11-03T00:00:00Z"), isLate: true },
    ] }, { id: "a2", code: "B", name: "Finishing", assignments: [], reports: [] }],
} as unknown as PeriodProject;

describe("TASK-18 PDF Bulanan & Rentang Harian", () => {
  it("[AC-21.1 / BR-37] menghitung wajib lapor, tepat waktu, terlambat, dan missing pada hari kerja project", () => {
    expect(calculateMonthlyAreaMetrics(project, "2026-11")).toEqual([
      { areaCode: "A", areaName: "Struktur", requiredDays: 3, onTime: 1, late: 1, missing: 1 },
      { areaCode: "B", areaName: "Finishing", requiredDays: 0, onTime: 0, late: 0, missing: 0 },
    ]);
  });

  it("[AC-21.1 / BR-37] PDF bulanan hanya memuat empat metrik tanpa persentase atau narasi", () => {
    const content = JSON.stringify(monthlyReportDefinition(project, "2026-11", calculateMonthlyAreaMetrics(project, "2026-11")).content);
    for (const label of ["Hari Wajib Lapor", "Tepat Waktu", "Terlambat", "Belum Lapor"]) expect(content).toContain(label);
    expect(content).not.toMatch(/persentase|kepatuhan|%/i);
  });

  it("[AC-21.2 / BR-38] PDF rentang memasukkan laporan lengkap, foto, dan placeholder Belum lapor", () => {
    const content = JSON.stringify(rangeReportDefinition(project, "2026-11-02", "2026-11-03", [
      { date: "2026-11-02", areaCode: "A", areaName: "Struktur", reportNumber: "LH-01", reportType: "WORK",
        weather: "CERAH", workerCount: 6, progressText: "Pengecoran selesai", photos: [{ dataUrl: "data:image/jpeg;base64,abc", caption: "Balok" }] },
      { date: "2026-11-03", areaCode: "A", areaName: "Struktur" },
    ]).content);
    for (const value of ["LH-01", "Pengecoran selesai", "data:image/jpeg", "Balok", "Belum lapor"]) expect(content).toContain(value);
  });

  it("[AC-21.2 / BR-38] menerima range maksimal 7 hari dan menolak range yang lebih panjang dengan 400", async () => {
    const base = { projectId: "9c63b00c-0c4e-4ac0-9391-71aa5cb8dce1", fromDate: "2026-11-01" };
    expect(exportDailyReportRangePdfQuerySchema.safeParse({ ...base, toDate: "2026-11-07" }).success).toBe(true);
    await expect(PdfExportPeriodService.dailyRange(base.projectId, base.fromDate, "2026-11-08"))
      .rejects.toMatchObject({ code: "DATE_RANGE_TOO_LONG", statusCode: 400 });
  });

  it("[BR-37 / BR-38] memvalidasi bulan kalender dan urutan tanggal", () => {
    expect(exportMonthlyReportPdfQuerySchema.safeParse({ projectId: "9c63b00c-0c4e-4ac0-9391-71aa5cb8dce1", month: "2026-13" }).success).toBe(false);
    expect(exportDailyReportRangePdfQuerySchema.safeParse({ projectId: "9c63b00c-0c4e-4ac0-9391-71aa5cb8dce1", fromDate: "2026-11-08", toDate: "2026-11-07" }).success).toBe(false);
  });
});
