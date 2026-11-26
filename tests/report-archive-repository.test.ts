import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/configs/prisma-client.config.js";
import { ReportArchiveService } from "../src/features/report/report-archive.service.js";
import { ReportRepository } from "../src/features/report/report.repository.js";
import { REPORT_DETAIL_INCLUDE } from "../src/features/report/report.prisma.js";
import { FileRepository } from "../src/features/upload/file.repository.js";
import { DashboardRepository } from "../src/features/dashboard/dashboard.repository.js";
import { fetchProjectAndAreas } from "../src/features/pdf-export/pdf-export.repository.js";

vi.mock("../src/configs/prisma-client.config.js", () => ({ prisma: {
  project: { findMany: vi.fn(), findFirst: vi.fn() },
  area: { findFirst: vi.fn() },
  dailyReport: { updateMany: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
  storedFile: { findUnique: vi.fn() },
} }));

describe("BR-25 — kondisi atomik dan pembaca data historis", () => {
  afterEach(() => vi.resetAllMocks());

  it("request bersamaan memakai update kondisional yang sama dan batas timezone masing-masing", async () => {
    vi.mocked(prisma.project.findMany).mockResolvedValue([
      { timezone: "Asia/Jakarta" }, { timezone: "Asia/Jayapura" },
    ] as Awaited<ReturnType<typeof prisma.project.findMany>>);
    vi.mocked(prisma.dailyReport.updateMany).mockResolvedValue({ count: 0 });
    const now = new Date("2026-11-16T16:00:00Z");
    const scope = { areaId: "area-a", reportDate: { gte: new Date("2026-11-01") } };
    await Promise.all([ReportArchiveService.process(scope, now), ReportArchiveService.process(scope, now)]);
    expect(prisma.dailyReport.updateMany).toHaveBeenCalledTimes(4);
    for (const [args] of vi.mocked(prisma.dailyReport.updateMany).mock.calls) {
      expect(args?.where?.AND).toEqual([scope, expect.objectContaining({ status: "SUBMITTED", archivedAt: null })]);
      expect(args?.data).toEqual({ archivedAt: now });
    }
    expect(prisma.dailyReport.updateMany).toHaveBeenCalledWith({ where: { AND: [scope, {
      status: "SUBMITTED", archivedAt: null, reportDate: { lt: new Date("2026-11-17") },
      area: { project: { timezone: "Asia/Jayapura" } },
    }] }, data: { archivedAt: now } });
    expect(prisma.dailyReport.updateMany).toHaveBeenCalledWith({ where: { AND: [scope, {
      status: "SUBMITTED", archivedAt: null, reportDate: { lt: new Date("2026-11-16") },
      area: { project: { timezone: "Asia/Jakarta" } },
    }] }, data: { archivedAt: now } });
  });

  it("AC-26.2: scope tanpa kandidat terkirim tidak dimutasi atau dibuatkan laporan", async () => {
    vi.mocked(prisma.project.findMany).mockResolvedValue([]);
    await ReportArchiveService.process({ areaId: "draft-or-missing" });
    expect(prisma.dailyReport.updateMany).not.toHaveBeenCalled();
    expect(prisma.project.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { areas: { some: { reports: { some: { AND: [{ areaId: "draft-or-missing" }, {
        status: "SUBMITTED", archivedAt: null,
      }] } } } } },
    }));
  });

  it("detail/foto, kewajiban laporan, rekap, dan PDF tidak menyembunyikan arsip", async () => {
    await ReportRepository.findReportDetailById("historical");
    await FileRepository.findById("historical");
    for (const [args] of vi.mocked(prisma.dailyReport.findFirst).mock.calls) {
      expect(args?.where).not.toHaveProperty("archivedAt");
    }
    const fileQuery = JSON.stringify(vi.mocked(prisma.storedFile.findUnique).mock.calls[0]?.[0]);
    expect(fileQuery).not.toContain("archivedAt");
    await ReportRepository.findAreaContextForSubmit("area-a");
    const context = vi.mocked(prisma.area.findFirst).mock.calls[0]?.[0];
    expect(context?.select?.reports).not.toHaveProperty("where.archivedAt");
    expect(REPORT_DETAIL_INCLUDE.area.select.reports.where).toEqual({ status: "SUBMITTED" });
    await DashboardRepository.findSubmittedReportsForLateness({});
    expect(vi.mocked(prisma.dailyReport.findMany).mock.calls[0]?.[0]?.where).not.toHaveProperty("archivedAt");
    await fetchProjectAndAreas("project-a", new Date("2026-11-16"));
    expect(vi.mocked(prisma.project.findFirst).mock.calls[0]?.[0]).toMatchObject({
      select: { areas: { select: { assignments: expect.any(Object), reports: {
        where: { reportDate: new Date("2026-11-16"), status: "SUBMITTED" },
      } } } },
    });
    const pdfQuery = JSON.stringify(vi.mocked(prisma.project.findFirst).mock.calls[0]?.[0]);
    expect(pdfQuery).not.toContain("archivedAt");
  });
});
