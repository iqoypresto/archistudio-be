import { ReportStatus } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { ReportRepository } from "../src/features/report/report.repository.js";
import { ReportUploadSessionRepository } from "../src/features/report/report-upload-session.repository.js";
import * as storageAdapter from "../src/utils/storage/storage.adapter.js";
import { invokeApp } from "./helpers/invoke-app.helper.js";
import {
  makeReportRecord,
  makeSupervisorAuthHeader,
  TEST_AREA_ID,
  TEST_PROJECT_ID,
  TEST_REPORT_ID,
} from "./helpers/report-fixture.helper.js";

vi.mock("../src/configs/prisma-client.config.js", () => ({ prisma: {} }));
vi.mock("../src/features/report/report-archive.service.js", () => ({
  ReportArchiveService: { process: vi.fn().mockResolvedValue(undefined) },
}));

interface ApiEnvelope<T = Record<string, unknown>> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

const SESSION_ID = "55555555-5555-4555-8555-555555555555";
const PHOTO_KEY = `projects/${TEST_PROJECT_ID}/areas/${TEST_AREA_ID}/2026-11-16/sup-1/${SESSION_ID}/photo-1.jpg`;

function reportBody() {
  return {
    areaId: TEST_AREA_ID,
    reportDate: "2026-11-16",
    reportType: "WORK",
    progressText: "Pengecoran sloof selesai 80%",
    obstaclesText: "Tidak ada",
    tomorrowPlanText: "Lanjut pemasangan kolom",
    weather: "CERAH",
    workerCount: 12,
    photos: [{ storageKey: PHOTO_KEY, caption: "Sloof", sortOrder: 0 }],
    sessionId: SESSION_ID,
  };
}

function mockValidSubmit() {
  vi.spyOn(ReportRepository, "findAreaContextForSubmit").mockResolvedValue({
    id: TEST_AREA_ID,
    code: "A",
    project: {
      id: TEST_PROJECT_ID, code: "VLA01",
      startDate: new Date("2026-11-16T00:00:00.000Z"), endDate: null,
      timezone: "Asia/Jakarta", routineHolidays: [0],
    },
    assignments: [{ supervisorId: "sup-1", startDate: new Date("2026-11-16T00:00:00.000Z"), endDate: null }],
    reports: [], unlocks: [],
  } as never);
  vi.spyOn(ReportUploadSessionRepository, "claimForFinalizing").mockResolvedValue(true);
  vi.spyOn(ReportUploadSessionRepository, "findOwned").mockResolvedValue({
    id: SESSION_ID, areaId: TEST_AREA_ID, reportDate: new Date("2026-11-16T00:00:00.000Z"),
    photos: [{ storageKey: PHOTO_KEY }],
  } as never);
  vi.spyOn(ReportUploadSessionRepository, "finalizeAndCreateReport").mockResolvedValue(
    makeReportRecord({ status: ReportStatus.SUBMITTED }) as never,
  );
  vi.spyOn(storageAdapter.StorageAdapter, "getObjectLastModified").mockResolvedValue({
    exists: true, lastModified: new Date("2026-11-16T09:30:00.000Z"),
  });
  vi.spyOn(storageAdapter, "createSignedViewUrlsMap").mockResolvedValue({
    [PHOTO_KEY]: "https://r2/view",
  });
}

describe("Supervisor report direct submission", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("membuat laporan terkirim dan membubuhkan paraf setelah sesi foto dikonfirmasi server", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-16T10:00:00.000Z"));
    mockValidSubmit();
    const res = await invokeApp<ApiEnvelope<{ reportNumber: string; status: ReportStatus; isLate: boolean }>>(app, {
      method: "POST", path: "/api/v1/reports/submit",
      headers: makeSupervisorAuthHeader(), body: reportBody(),
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      reportNumber: "LH/VLA01/A/20261116", status: ReportStatus.SUBMITTED, isLate: false,
    });
    expect(ReportUploadSessionRepository.finalizeAndCreateReport).toHaveBeenCalledWith(
      expect.objectContaining({ report: expect.objectContaining({ signedByName: "Budi Pengawas" }) }),
    );
  });

  it("mengembalikan kewajiban tanggal hanya sebagai laporan yang belum terkirim", async () => {
    vi.spyOn(ReportRepository, "findReportsPaginated").mockResolvedValue([[], 0]);
    const res = await invokeApp<ApiEnvelope<unknown[]>>(app, {
      method: "GET", path: "/api/v1/reports?page=1&pageSize=10",
      headers: makeSupervisorAuthHeader("sup-1"),
    });
    expect(res.status).toBe(200);
    expect(ReportRepository.findReportsPaginated).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: ReportStatus.SUBMITTED }),
    }));
  });

  it.each([
    ["/api/v1/reports/draft", "POST"],
    [`/api/v1/reports/${TEST_REPORT_ID}/submit`, "POST"],
  ])("tidak lagi menyediakan endpoint draft lama (%s)", async (path, method) => {
    const res = await invokeApp<ApiEnvelope>(app, {
      method: method as "POST", path, headers: makeSupervisorAuthHeader(), body: {},
    });
    expect(res.status).toBe(404);
  });
});
