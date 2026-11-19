import { ReportStatus, ReportType } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { ReportRepository } from "../src/features/report/report.repository.js";
import * as storageAdapter from "../src/utils/storage/storage.adapter.js";
import { invokeApp } from "./helpers/invoke-app.helper.js";
import {
  makeReportRecord,
  makeSupervisorAuthHeader,
  TEST_AREA_ID,
  TEST_PHOTO_KEY,
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

describe("TASK-07 Daily Report Draft & Submit API", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("menolak saveDraft pada tanggal yang terkunci (AC-10.1, BR-20 -> 423)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-16T04:00:00.000Z"));
    vi.spyOn(ReportRepository, "findAreaContextForDraft").mockResolvedValue({
      id: TEST_AREA_ID,
      code: "A",
      project: {
        id: TEST_PROJECT_ID,
        code: "VLA01",
        startDate: new Date("2026-11-14T00:00:00.000Z"),
        endDate: null,
        timezone: "Asia/Jakarta",
        routineHolidays: [0],
      },
      assignments: [
        {
          supervisorId: "sup-1",
          startDate: new Date("2026-11-14T00:00:00.000Z"),
          endDate: null,
        },
      ],
      reports: [],
      unlocks: [],
    });

    const res = await invokeApp<ApiEnvelope>(app, {
      method: "POST",
      path: "/api/v1/reports/draft",
      headers: makeSupervisorAuthHeader(),
      body: { areaId: TEST_AREA_ID, reportDate: "2026-11-16", reportType: "WORK" },
    });
    expect(res.status).toBe(423);
    expect(res.body.error?.code).toBe("PREVIOUS_DATE_REPORT_LOCKED");
  });

  it("mengirim laporan WORK tepat waktu (<= 17:00 WIB) dengan paraf otomatis (AC-08.1, BR-13, BR-26)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-16T10:00:00.000Z")); // 17:00:00 WIB
    vi.spyOn(ReportRepository, "findReportDetailById").mockResolvedValue(makeReportRecord());
    const submitSpy = vi.spyOn(ReportRepository, "submitReportTransaction").mockResolvedValue(
      makeReportRecord({ status: ReportStatus.SUBMITTED, isLate: false }),
    );
    vi.spyOn(storageAdapter, "createSignedViewUrlsMap").mockResolvedValue({
      [TEST_PHOTO_KEY]: "https://r2/view",
    });

    vi.spyOn(storageAdapter.StorageAdapter, "getObjectLastModified").mockResolvedValue({
      exists: true,
      lastModified: new Date("2026-11-16T09:30:00.000Z"),
    });
    const res = await invokeApp<ApiEnvelope<{
      reportNumber: string;
      isLate: boolean;
      lateLabel: string | null;
    }>>(app, {
      method: "POST",
      path: `/api/v1/reports/${TEST_REPORT_ID}/submit`,
      headers: makeSupervisorAuthHeader(),
      body: { photos: [{ storageKey: TEST_PHOTO_KEY, caption: "Sloof", sortOrder: 0 }] },
    });
    expect(res.status).toBe(200);
    expect(res.body.data?.lateLabel).toBeNull();
    expect(submitSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        isLate: false,
        signedByName: "Budi Pengawas",
        signedByTitle: "Supervisor Lapangan",
      }),
    );
    expect(res.body.data?.reportNumber).toBe("LH/VLA01/A/20261116");
  });

  it("menandai terlambat lewat 17:00 zona project & menolak foto kosong / NO_WORK tanpa alasan (AC-08.2, AC-08.3, AC-09.1)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-16T09:00:01.000Z")); // 17:00:01 WITA
    vi.spyOn(ReportRepository, "findReportDetailById").mockResolvedValue(
      makeReportRecord({ timezone: "Asia/Makassar", photosCount: 0 }),
    );

    const noPhotoRes = await invokeApp<ApiEnvelope>(app, {
      method: "POST",
      path: `/api/v1/reports/${TEST_REPORT_ID}/submit`,
      headers: makeSupervisorAuthHeader(),
      body: { reportType: "WORK", photos: [] },
    });
    expect(noPhotoRes.status).toBe(400);
    expect(noPhotoRes.body.error?.code).toBe("INVALID_PHOTO_COUNT");

    const badNoWorkRes = await invokeApp<ApiEnvelope>(app, {
      method: "POST",
      path: `/api/v1/reports/${TEST_REPORT_ID}/submit`,
      headers: makeSupervisorAuthHeader(),
      body: {
        reportType: "NO_WORK",
        noWorkReason: "   ",
        photos: [{ storageKey: TEST_PHOTO_KEY, sortOrder: 0 }],
      },
    });
    expect(badNoWorkRes.status).toBe(400);
    expect(badNoWorkRes.body.error?.code).toBe("NO_WORK_REASON_OR_PHOTO_REQUIRED");

    const submitSpy = vi.spyOn(ReportRepository, "submitReportTransaction").mockResolvedValue(
      makeReportRecord({ status: ReportStatus.SUBMITTED, reportType: ReportType.NO_WORK, isLate: true }),
    );
    vi.spyOn(storageAdapter.StorageAdapter, "getObjectLastModified").mockResolvedValue({
      exists: true,
      lastModified: new Date("2026-11-16T09:30:00.000Z"),
    });
    vi.spyOn(storageAdapter, "createSignedViewUrlsMap").mockResolvedValue({
      [TEST_PHOTO_KEY]: "https://r2/view",
    });
    const okNoWork = await invokeApp<ApiEnvelope>(app, {
      method: "POST",
      path: `/api/v1/reports/${TEST_REPORT_ID}/submit`,
      headers: makeSupervisorAuthHeader(),
      body: {
        reportType: "NO_WORK",
        noWorkReason: "Hujan Lebat",
        photos: [{ storageKey: TEST_PHOTO_KEY, sortOrder: 0 }],
      },
    });
    expect(okNoWork.status).toBe(200);
    expect(okNoWork.body.data?.isLate).toBe(true);
    expect(okNoWork.body.data?.lateLabel).toBe("Diunggah terlambat");
    expect(submitSpy).toHaveBeenCalledWith(expect.objectContaining({ isLate: true }));
    expect(submitSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        photos: [expect.objectContaining({ uploadedAt: "2026-11-16T09:30:00.000Z" })],
      }),
    );
  });

  it("mengunci updateDraft setelah SUBMITTED (BR-24) & memfilter riwayat supervisor (BR-03)", async () => {
    vi.spyOn(ReportRepository, "findReportDetailById").mockResolvedValue(
      makeReportRecord({ status: ReportStatus.SUBMITTED }),
    );
    const lockRes = await invokeApp<ApiEnvelope>(app, {
      method: "PUT",
      path: `/api/v1/reports/${TEST_REPORT_ID}/draft`,
      headers: makeSupervisorAuthHeader(),
      body: { progressText: "Coba ubah" },
    });
    expect(lockRes.status).toBe(403);
    expect(lockRes.body.error?.code).toBe("REPORT_LOCKED_AFTER_SUBMIT");

    const listSpy = vi.spyOn(ReportRepository, "findReportsPaginated").mockResolvedValue([[], 0]);
    const listRes = await invokeApp<ApiEnvelope<unknown[]>>(app, {
      method: "GET",
      path: "/api/v1/reports?page=1&pageSize=10",
      headers: makeSupervisorAuthHeader("sup-1"),
    });
    expect(listRes.status).toBe(200);
    expect(listSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          area: expect.objectContaining({ assignments: { some: { supervisorId: "sup-1" } } }),
        }),
      }),
    );
  });
});
