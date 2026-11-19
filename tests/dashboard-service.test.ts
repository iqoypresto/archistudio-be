import { ReportStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { DashboardRepository } from "../src/features/dashboard/dashboard.repository.js";
import { DashboardService } from "../src/features/dashboard/dashboard.service.js";

describe("TASK-08 Backend Dashboard Monitoring & Keterlambatan Supervisor", () => {
  it("[AC-11.1 / BR-11 / BR-22] menghitung KPI dashboard dan mendeteksi area tertunggak > 3 hari", async () => {
    vi.spyOn(DashboardRepository, "countActiveProjects").mockResolvedValue(2);
    vi.spyOn(DashboardRepository, "findActiveAreasWithDetails").mockResolvedValue([
      {
        id: "area-1",
        code: "A",
        name: "Struktur",
        project: {
          id: "proj-1",
          code: "VLA01",
          name: "Villa Canggu",
          location: "Bali",
          startDate: new Date("2026-11-01T00:00:00.000Z"),
          endDate: null,
          timezone: "Asia/Makassar",
          routineHolidays: [0], // Minggu libur
        },
        assignments: [
          {
            id: "assign-1",
            startDate: new Date("2026-11-01T00:00:00.000Z"),
            endDate: null,
            supervisor: {
              id: "spv-1",
              name: "Ahmad Fauzi",
              jobTitle: "Supervisor",
            },
          },
        ],
        reports: [
          {
            id: "rep-1",
            reportNumber: "LH/VLA01/A/20261101",
            reportDate: new Date("2026-11-01T00:00:00.000Z"),
            status: ReportStatus.SUBMITTED,
            submittedAt: new Date("2026-11-01T10:00:00.000Z"),
            isLate: false,
            supervisorId: "spv-1",
          },
        ],
        unlocks: [],
      },
    ]);

    const result = await DashboardService.getSummary(
      { statusFilter: "ALL" },
      new Date("2026-11-07T00:00:00.000Z"),
    );

    expect(result.metrics.totalProjects).toBe(2);
    expect(result.metrics.activeAreas).toBe(1);
    expect(result.areas.length).toBe(1);
    const area = result.areas[0]!;
    expect(area.areaCode).toBe("A");
    expect(area.status).toBe("BELUM_LAPOR");
    expect(area.isOverdueMoreThan3Days).toBe(true);
    expect(area.overdueBusinessDaysCount).toBeGreaterThanOrEqual(4);
  });

  it("[BR-21] mengagregasi rekap ketepatan waktu & rasio keterlambatan per supervisor", async () => {
    vi.spyOn(DashboardRepository, "findSubmittedReportsForLateness").mockResolvedValue([
      {
        id: "rep-1",
        isLate: false,
        supervisor: { id: "spv-1", name: "Ahmad Fauzi", username: "supervisor1" },
      },
      {
        id: "rep-2",
        isLate: true,
        supervisor: { id: "spv-1", name: "Ahmad Fauzi", username: "supervisor1" },
      },
      {
        id: "rep-3",
        isLate: false,
        supervisor: { id: "spv-2", name: "Rudi Hartono", username: "supervisor2" },
      },
    ]);

    const result = await DashboardService.getSupervisorLateness({});

    expect(result.length).toBe(2);
    const spv1 = result.find((s) => s.supervisorId === "spv-1")!;
    expect(spv1.totalReports).toBe(2);
    expect(spv1.onTimeCount).toBe(1);
    expect(spv1.lateCount).toBe(1);
    expect(spv1.onTimePercentage).toBe(50);

    const spv2 = result.find((s) => s.supervisorId === "spv-2")!;
    expect(spv2.totalReports).toBe(1);
    expect(spv2.onTimeCount).toBe(1);
    expect(spv2.lateCount).toBe(0);
    expect(spv2.onTimePercentage).toBe(100);
  });
});
