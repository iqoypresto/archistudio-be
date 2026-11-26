import { ReportStatus, Role } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardRepository } from "../src/features/dashboard/dashboard.repository.js";
import { DashboardService } from "../src/features/dashboard/dashboard.service.js";

describe("TASK-08 Backend Dashboard Monitoring & Keterlambatan Supervisor", () => {
  afterEach(() => vi.restoreAllMocks());

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
              role: Role.SUPERVISOR,
              isActive: true,
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

  it("[Wave 1A] area tanpa pengawas aktif dan area di luar jadwal tidak dihitung tertunggak", async () => {
    vi.spyOn(DashboardRepository, "countActiveProjects").mockResolvedValue(1);
    vi.spyOn(DashboardRepository, "findActiveAreasWithDetails").mockResolvedValue([
      {
        id: "area-unassigned",
        code: "B",
        name: "Taman",
        project: {
          id: "proj-1",
          code: "VLA01",
          name: "Villa Canggu",
          location: "Bali",
          startDate: new Date("2026-11-01T00:00:00.000Z"),
          endDate: null,
          timezone: "Asia/Jakarta",
          routineHolidays: [0],
        },
        assignments: [],
        reports: [],
        unlocks: [],
      },
      {
        id: "area-future",
        code: "C",
        name: "Interior",
        project: {
          id: "proj-1",
          code: "VLA01",
          name: "Villa Canggu",
          location: "Bali",
          startDate: new Date("2026-11-20T00:00:00.000Z"),
          endDate: null,
          timezone: "Asia/Jakarta",
          routineHolidays: [0],
        },
        assignments: [
          {
            id: "assign-2",
            startDate: new Date("2026-11-20T00:00:00.000Z"),
            endDate: null,
            supervisor: {
              id: "spv-2",
              name: "Rudi",
              jobTitle: "Site Manager",
              role: Role.SITE_MANAGER,
              isActive: true,
            },
          },
        ],
        reports: [],
        unlocks: [],
      },
    ]);
    const overviewSpy = vi.spyOn(DashboardRepository, "getSystemOverview").mockResolvedValue({
      projects: { running: 1, preparing: 2, completed: 3, archivedManual: 1, withoutSiteManager: 1 },
      team: {
        totalActive: 5,
        inactiveCount: 1,
        ownerCount: 1,
        adminCount: 1,
        siteManagerCount: 1,
        supervisorCount: 2,
        unassignedAreasCount: 1,
        areasWithInactiveSupervisorCount: 0,
      },
      recentActivity: { days: 7, commsInCount: 2, commsOutCount: 1, drawingsCount: 3, documentsCount: 4 },
      payments: {
        unpaidCount: 2,
        totalUnpaidAmount: 5_000_000,
        overdueUnpaidCount: 1,
        freelanceUnpaidCount: 1,
        agentUnpaidCount: 1,
      },
    });

    const result = await DashboardService.getSummary(
      { date: "2026-11-10", statusFilter: "ALL" },
      new Date("2026-11-10T05:00:00.000Z"),
      Role.OWNER,
    );

    expect(overviewSpy).toHaveBeenCalledWith(true, expect.any(Date));
    expect(result.systemOverview?.projects.preparing).toBe(2);
    expect(result.systemOverview?.payments?.overdueUnpaidCount).toBe(1);
    expect(result.metrics.areasOverdueMoreThan3Days).toBe(0);
    expect(result.areas[0]?.status).toBe("BELUM_DITUGASKAN");
    expect(result.areas[0]?.isOverdueMoreThan3Days).toBe(false);
    expect(result.areas[1]?.status).toBe("DI_LUAR_JADWAL");
    expect(result.areas[1]?.isOverdueMoreThan3Days).toBe(false);
  });

  it("[BR-21] mengagregasi rekap ketepatan waktu & rasio keterlambatan per pengawas", async () => {
    vi.spyOn(DashboardRepository, "findSubmittedReportsForLateness").mockResolvedValue([
      {
        id: "rep-1",
        isLate: false,
        supervisor: {
          id: "spv-1",
          name: "Ahmad Fauzi",
          username: "supervisor1",
          role: Role.SUPERVISOR,
          jobTitle: "Supervisor",
        },
      },
      {
        id: "rep-2",
        isLate: true,
        supervisor: {
          id: "spv-1",
          name: "Ahmad Fauzi",
          username: "supervisor1",
          role: Role.SUPERVISOR,
          jobTitle: "Supervisor",
        },
      },
      {
        id: "rep-3",
        isLate: false,
        supervisor: {
          id: "spv-2",
          name: "Rudi Hartono",
          username: "sm1",
          role: Role.SITE_MANAGER,
          jobTitle: "Site Manager",
        },
      },
    ]);

    const result = await DashboardService.getSupervisorLateness({});

    expect(result.length).toBe(2);
    const spv1 = result.find((s) => s.supervisorId === "spv-1")!;
    expect(spv1.totalReports).toBe(2);
    expect(spv1.onTimeCount).toBe(1);
    expect(spv1.lateCount).toBe(1);
    expect(spv1.onTimePercentage).toBe(50);
    expect(spv1.supervisorRole).toBe(Role.SUPERVISOR);

    const spv2 = result.find((s) => s.supervisorId === "spv-2")!;
    expect(spv2.totalReports).toBe(1);
    expect(spv2.onTimeCount).toBe(1);
    expect(spv2.lateCount).toBe(0);
    expect(spv2.onTimePercentage).toBe(100);
    expect(spv2.supervisorRole).toBe(Role.SITE_MANAGER);
  });
});
