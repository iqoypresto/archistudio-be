import { ReportStatus, Role, WeatherType } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { ReportRepository } from "../src/features/report/report.repository.js";
import { signAccessToken } from "../src/utils/auth/jwt.util.js";
import * as storageAdapter from "../src/utils/storage/storage.adapter.js";
import { invokeApp } from "./helpers/invoke-app.helper.js";
import {
  makeReportRecord,
  TEST_PHOTO_KEY,
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

function authHeaderFor(role: Role, id = "user-1", name = "Owner Utama") {
  return {
    Authorization: `Bearer ${signAccessToken({
      sub: id,
      role,
      username: role.toLowerCase(),
      name,
      jobTitle: role,
    })}`,
  };
}

describe("TASK-09 Report Detail & Owner Revision Snapshot JSON", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("menolak ADMIN dan SUPERVISOR merevisi laporan SUBMITTED (AC-14.1, BR-02, BR-24)", async () => {
    for (const role of [Role.ADMIN, Role.SUPERVISOR]) {
      const res = await invokeApp<ApiEnvelope>(app, {
        method: "PATCH",
        path: `/api/v1/reports/${TEST_REPORT_ID}/revise`,
        headers: authHeaderFor(role),
        body: { changeSummary: "Mencoba edit laporan" },
      });
      expect(res.status).toBe(403);
      expect(res.body.error?.code).toBe("REPORT_LOCKED_AFTER_SUBMIT");
    }
  });

  it("menolak revisi jika changeSummary kurang dari 3 karakter", async () => {
    const badValidation = await invokeApp<ApiEnvelope>(app, {
      method: "PATCH",
      path: `/api/v1/reports/${TEST_REPORT_ID}/revise`,
      headers: authHeaderFor(Role.OWNER),
      body: { changeSummary: "ok" },
    });
    expect(badValidation.status).toBe(422);
    expect(badValidation.body.error?.code).toBe("VALIDATION_ERROR");

  });

  it("mengizinkan OWNER merevisi laporan SUBMITTED & menyimpan previousSnapshotJson utuh (AC-14.1, ADR-05)", async () => {
    const submittedBefore = makeReportRecord({ status: ReportStatus.SUBMITTED });
    vi.spyOn(ReportRepository, "findReportDetailById").mockResolvedValue(submittedBefore);
    const reviseSpy = vi.spyOn(ReportRepository, "reviseReportTransaction").mockResolvedValue({
      ...submittedBefore,
      workerCount: 12,
      progressText: "Koreksi progres pengecoran selesai 100%",
      isRevised: true,
      revisionNo: 1,
      revisedAt: new Date("2026-11-16T12:00:00.000Z"),
      revisions: [
        {
          id: "rev-1",
          reportId: TEST_REPORT_ID,
          revisionNo: 1,
          revisedById: "owner-1",
          changeSummary: "Koreksi jumlah pekerja & progres",
          previousSnapshotJson: {
            reportType: "WORK",
            progressText: "Cor kolom lantai 1",
            workerCount: 8,
            photos: [{ id: "photo-0", storageKey: TEST_PHOTO_KEY, caption: "Foto bukti", sortOrder: 0, takenAt: null }],
          },
          createdAt: new Date("2026-11-16T12:00:00.000Z"),
          revisedBy: { name: "Owner Utama" },
        },
      ],
    });
    vi.spyOn(storageAdapter, "createSignedViewUrlsMap").mockResolvedValue({
      [TEST_PHOTO_KEY]: "https://r2/signed-view",
    });

    const res = await invokeApp<
      ApiEnvelope<{ isRevised: boolean; revisionNo: number; revisions: unknown[] }>
    >(app, {
      method: "PATCH",
      path: `/api/v1/reports/${TEST_REPORT_ID}/revise`,
      headers: authHeaderFor(Role.OWNER, "owner-1", "Owner Utama"),
      body: {
        changeSummary: "Koreksi jumlah pekerja & progres",
        workerCount: 12,
        weather: WeatherType.BERAWAN,
        progressText: "Koreksi progres pengecoran selesai 100%",
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.data?.isRevised).toBe(true);
    expect(res.body.data?.revisionNo).toBe(1);
    expect(reviseSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        revisionNo: 1,
        changeSummary: "Koreksi jumlah pekerja & progres",
        previousSnapshotJson: expect.objectContaining({
          progressText: "Cor kolom lantai 1",
          workerCount: 8,
          signedByName: "Budi Pengawas",
          photos: expect.arrayContaining([
            expect.objectContaining({ storageKey: TEST_PHOTO_KEY }),
          ]),
        }),
      }),
    );
  });

  it("menolak SUPERVISOR membaca detail laporan area lain & mengizinkan OWNER/ADMIN (AC-07.1, BR-03)", async () => {
    vi.spyOn(ReportRepository, "findReportDetailById").mockResolvedValue(
      makeReportRecord({ status: ReportStatus.SUBMITTED }),
    );
    const forbiddenRes = await invokeApp<ApiEnvelope>(app, {
      method: "GET",
      path: `/api/v1/reports/${TEST_REPORT_ID}`,
      headers: authHeaderFor(Role.SUPERVISOR, "sup-lain", "Pengawas Lain"),
    });
    expect(forbiddenRes.status).toBe(403);
    expect(forbiddenRes.body.error?.code).toBe("AREA_SCOPE_FORBIDDEN");

    vi.spyOn(storageAdapter, "createSignedViewUrlsMap").mockResolvedValue({
      [TEST_PHOTO_KEY]: "https://r2/signed-view",
    });
    const adminRes = await invokeApp<ApiEnvelope<{ signedByName: string }>>(app, {
      method: "GET",
      path: `/api/v1/reports/${TEST_REPORT_ID}`,
      headers: authHeaderFor(Role.ADMIN, "admin-1", "Admin Studio"),
    });
    expect(adminRes.status).toBe(200);
    expect(adminRes.body.data?.signedByName).toBe("Budi Pengawas");
  });
});
