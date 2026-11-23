import { ReportStatus, Role } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportArchiveRepository } from "../src/features/report/report-archive.repository.js";
import { ReportRepository } from "../src/features/report/report.repository.js";
import { ReportReadService } from "../src/features/report/report-read.service.js";
import * as storage from "../src/utils/storage/storage.adapter.js";
import { makeReportRecord, TEST_PHOTO_KEY, TEST_REPORT_ID } from "./helpers/report-fixture.helper.js";

vi.mock("../src/configs/prisma-client.config.js", () => ({ prisma: {} }));
const supervisor = { id: "sup-1", role: Role.SUPERVISOR, username: "sup1", name: "Budi", jobTitle: "Supervisor" };

describe("BR-25 — detail dan arsip laporan terkirim", () => {
  afterEach(() => vi.restoreAllMocks());

  it("detail arsip mempertahankan foto, paraf, dan timestamp", async () => {
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
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("menolak detail lintas area sebelum mutasi arsip", async () => {
    vi.spyOn(ReportRepository, "findReportDetailById").mockResolvedValue(
      makeReportRecord({ status: ReportStatus.SUBMITTED }),
    );
    const update = vi.spyOn(ReportArchiveRepository, "findTimezones");
    await expect(ReportReadService.detail(TEST_REPORT_ID, { ...supervisor, id: "outsider" }))
      .rejects.toMatchObject({ code: "AREA_SCOPE_FORBIDDEN" });
    expect(update).not.toHaveBeenCalled();
  });
});
