import { ReportStatus, Role } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { archiveTimestamp } from "../src/features/report/report-archive.helper.js";
import { ReportArchiveRepository } from "../src/features/report/report-archive.repository.js";
import { ReportRepository } from "../src/features/report/report.repository.js";
import { ReportReadService } from "../src/features/report/report-read.service.js";
import { signAccessToken } from "../src/utils/auth/jwt.util.js";
import { invokeApp } from "./helpers/invoke-app.helper.js";
import { makeReportRecord, TEST_AREA_ID, TEST_PROJECT_ID } from "./helpers/report-fixture.helper.js";

vi.mock("../src/configs/prisma-client.config.js", () => ({ prisma: {} }));

const user = { id: "owner", role: Role.OWNER, username: "owner", name: "Owner", jobTitle: "Owner" };
const headers = (role: Role) => ({ Authorization: `Bearer ${signAccessToken({ ...user, sub: user.id, role })}` });
type Envelope = { data?: { archivedAt: string; status: string }[]; error?: { code: string }; meta?: { totalItems: number } };

function mockArchive() {
  vi.spyOn(ReportArchiveRepository, "findTimezones").mockResolvedValue(["Asia/Jakarta"]);
  return vi.spyOn(ReportArchiveRepository, "archiveBefore").mockResolvedValue({ count: 1 });
}

describe("TASK-14 / US-26 — arsip harian", () => {
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

  it.each([
    ["Asia/Jakarta", "2026-11-16T17:00:00Z"],
    ["Asia/Makassar", "2026-11-16T16:00:00Z"],
    ["Asia/Jayapura", "2026-11-16T15:00:00Z"],
  ])("AC-26.1: tepat pergantian tanggal di %s", (timezone, midnight) => {
    const date = new Date("2026-11-16T00:00:00Z");
    const now = new Date(midnight);
    expect(archiveTimestamp(date, timezone, new Date(now.getTime() - 1))).toBeNull();
    expect(archiveTimestamp(date, timezone, now)).toEqual(now);
    expect(archiveTimestamp(new Date("2026-11-18"), timezone, now)).toBeNull();
  });

  it.each([Role.OWNER, Role.ADMIN])("AC-26.1: %s menerima daftar arsip setelah pemrosesan scope", async (role) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const now = new Date("2026-11-16T17:00:00Z");
    vi.setSystemTime(now);
    const update = mockArchive();
    const record = { ...makeReportRecord({ status: ReportStatus.SUBMITTED }), archivedAt: now, _count: { photos: 1 } };
    const list = vi.spyOn(ReportRepository, "findReportsPaginated").mockResolvedValue([[record], 1]);
    const result = await invokeApp<Envelope>(app, {
      method: "GET", path: `/api/v1/reports/archive?projectId=${TEST_PROJECT_ID}&areaId=${TEST_AREA_ID}&dateFrom=2026-11-16&dateTo=2026-11-16&page=2&pageSize=5`, headers: headers(role),
    });
    expect(result.status).toBe(200);
    expect(result.body.data?.[0]?.archivedAt).toBe(now.toISOString());
    expect(result.body.meta?.totalItems).toBe(1);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ areaId: TEST_AREA_ID,
      area: expect.objectContaining({ projectId: TEST_PROJECT_ID }),
      reportDate: { gte: new Date("2026-11-16"), lte: new Date("2026-11-16") },
    }), "Asia/Jakarta", new Date("2026-11-17"), now);
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ skip: 5, take: 5,
      where: { AND: [expect.any(Object), { status: "SUBMITTED", archivedAt: { not: null } }] },
    }));
    expect(update.mock.invocationCallOrder[0]).toBeLessThan(list.mock.invocationCallOrder[0]!);
  });

  it("BR-25: Supervisor/anonymous ditolak sebelum pemrosesan; DELETE tidak tersedia", async () => {
    const archive = mockArchive();
    for (const [auth, status] of [[headers(Role.SUPERVISOR), 403], [{}, 401]] as const) {
      const response = await invokeApp<Envelope>(app, { method: "GET", path: "/api/v1/reports/archive", headers: auth });
      expect(response.status).toBe(status);
      if (status === 403) expect(response.body.error?.code).toBe("FORBIDDEN");
    }
    await expect(ReportReadService.list({ page: 1, pageSize: 10, sortBy: "reportDate", sortOrder: "desc" },
      { ...user, role: Role.SUPERVISOR }, true)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const deleted = await invokeApp(app, { method: "DELETE", path: "/api/v1/reports/44444444-4444-4444-8444-444444444444", headers: headers(Role.OWNER) });
    expect(deleted.status).toBe(404);
    expect(archive).not.toHaveBeenCalled();
  });

  it.each(["projectId=bad", "dateFrom=2026-02-30", "dateFrom=2026-11-19&dateTo=2026-11-16", "page=0", "sortBy=unknown"])(
    "validasi menolak %s sebelum update", async (query) => {
      const update = mockArchive();
      const response = await invokeApp<Envelope>(app, { method: "GET", path: `/api/v1/reports/archive?${query}`, headers: headers(Role.OWNER) });
      expect(response.status).toBe(422);
      expect(response.body.error?.code).toBe("VALIDATION_ERROR");
      expect(update).not.toHaveBeenCalled();
    },
  );

  it("BR-03/25: daftar umum mencakup riwayat arsip, pemrosesan dibatasi area Supervisor", async () => {
    const update = mockArchive();
    const list = vi.spyOn(ReportRepository, "findReportsPaginated").mockResolvedValue([[], 0]);
    await ReportReadService.list({ page: 1, pageSize: 10, sortBy: "reportDate", sortOrder: "desc" }, { ...user, role: Role.SUPERVISOR });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ area: expect.objectContaining({
      assignments: { some: { supervisorId: user.id } },
    }) }), "Asia/Jakarta", expect.any(Date), expect.any(Date));
    expect(list.mock.calls[0]?.[0].where).not.toHaveProperty("archivedAt");
  });
});
