import { ReportStatus, Role } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportArchiveRepository } from "../src/features/report/report-archive.repository.js";
import { ReportRepository } from "../src/features/report/report.repository.js";
import { ReportService } from "../src/features/report/report.service.js";
import { ReportReadService } from "../src/features/report/report-read.service.js";
import { ReportLockService } from "../src/features/report/report-lock.service.js";
import * as storage from "../src/utils/storage/storage.adapter.js";
import { makeReportRecord, TEST_PHOTO_KEY, TEST_REPORT_ID } from "./helpers/report-fixture.helper.js";

vi.mock("../src/configs/prisma-client.config.js", () => ({ prisma: {} }));
const supervisor = { id: "sup-1", role: Role.SUPERVISOR, username: "sup1", name: "Budi", jobTitle: "Supervisor" };

describe("AC-26.2 / BR-25 — submit dan detail historis", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ["2026-11-16T16:59:59Z", null],
    ["2026-11-16T17:00:00Z", "2026-11-16T17:00:00.000Z"],
  ])("submit %s menyimpan archivedAt bersama status/paraf dalam transaksi", async (timestamp, expected) => {
    const record = makeReportRecord();
    vi.spyOn(ReportRepository, "findReportDetailById").mockResolvedValue(record);
    vi.spyOn(storage.StorageAdapter, "getObjectLastModified").mockResolvedValue({ exists: true, lastModified: new Date(timestamp) });
    vi.spyOn(storage, "createSignedViewUrlsMap").mockResolvedValue({ [TEST_PHOTO_KEY]: "https://example.test/photo" });
    const submit = vi.spyOn(ReportRepository, "submitReportTransaction").mockImplementation(async (input) => ({
      ...record, status: ReportStatus.SUBMITTED, submittedAt: input.submittedAt, archivedAt: input.archivedAt,
    }));
    const result = await ReportService.submitReport(TEST_REPORT_ID, {}, supervisor, new Date(timestamp));
    expect(result.archivedAt).toBe(expected);
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({
      archivedAt: expected ? new Date(expected) : null, submittedAt: new Date(timestamp), signedByName: "Budi",
    }));
  });

  it("submit gagal validasi tidak menulis arsip (AC-26.2)", async () => {
    vi.spyOn(ReportRepository, "findReportDetailById").mockResolvedValue(makeReportRecord({ photosCount: 0 }));
    const submit = vi.spyOn(ReportRepository, "submitReportTransaction");
    await expect(ReportService.submitReport(TEST_REPORT_ID, {}, supervisor, new Date("2026-11-17T10:00:00Z")))
      .rejects.toMatchObject({ code: "INVALID_PHOTO_COUNT" });
    expect(submit).not.toHaveBeenCalled();
  });

  it("detail arsip mempertahankan foto, paraf, timestamp; draf tidak diarsipkan", async () => {
    const now = new Date("2026-11-17T01:00:00Z");
    const record = makeReportRecord({ status: ReportStatus.SUBMITTED });
    const find = vi.spyOn(ReportRepository, "findReportDetailById")
      .mockResolvedValueOnce(record).mockResolvedValueOnce({ ...record, archivedAt: now });
    vi.spyOn(ReportArchiveRepository, "findTimezones").mockResolvedValue(["Asia/Jakarta"]);
    const update = vi.spyOn(ReportArchiveRepository, "archiveBefore").mockResolvedValue({ count: 1 });
    vi.spyOn(storage, "createSignedViewUrlsMap").mockResolvedValue({ [TEST_PHOTO_KEY]: "https://example.test/photo" });
    const result = await ReportReadService.detail(TEST_REPORT_ID, supervisor, now);
    expect(result.archivedAt).toBe(now.toISOString());
    expect(result.signedByName).toBe("Budi Pengawas");
    expect(result.photos[0]?.signedViewUrl).toBe("https://example.test/photo");
    expect(update).toHaveBeenCalledWith({ id: TEST_REPORT_ID }, "Asia/Jakarta", new Date("2026-11-17"), now);
    find.mockResolvedValue({ ...record, archivedAt: now });
    await ReportReadService.detail(TEST_REPORT_ID, supervisor, new Date("2026-11-18"));
    find.mockResolvedValue(makeReportRecord());
    expect((await ReportReadService.detail(TEST_REPORT_ID, supervisor, now)).archivedAt).toBeNull();
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("detail lintas area ditolak sebelum mutasi arsip", async () => {
    vi.spyOn(ReportRepository, "findReportDetailById").mockResolvedValue(makeReportRecord({ status: ReportStatus.SUBMITTED }));
    const update = vi.spyOn(ReportArchiveRepository, "findTimezones");
    await expect(ReportReadService.detail(TEST_REPORT_ID, { ...supervisor, id: "outsider" }))
      .rejects.toMatchObject({ code: "AREA_SCOPE_FORBIDDEN" });
    expect(update).not.toHaveBeenCalled();
  });

  it("laporan terkirim tetap memenuhi tanggal sebelumnya ketika submit hari berikutnya", async () => {
    const record = makeReportRecord({ submittedDates: [new Date("2026-11-16")] });
    record.reportDate = new Date("2026-11-17");
    vi.spyOn(ReportRepository, "findReportDetailById").mockResolvedValue(record);
    const guard = vi.spyOn(ReportLockService, "assertDateUnlocked");
    vi.spyOn(storage.StorageAdapter, "getObjectLastModified").mockResolvedValue({ exists: true, lastModified: new Date() });
    vi.spyOn(storage, "createSignedViewUrlsMap").mockResolvedValue({});
    vi.spyOn(ReportRepository, "submitReportTransaction").mockResolvedValue({ ...record, status: ReportStatus.SUBMITTED });
    await ReportService.submitReport(TEST_REPORT_ID, {}, supervisor, new Date("2026-11-17T09:00:00Z"));
    expect(guard).toHaveBeenCalledWith(["2026-11-17"], "2026-11-17");
  });
});
