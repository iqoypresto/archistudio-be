import { ReportStatus, Role } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { ReportLockRepository } from "../src/features/report/report-lock.repository.js";
import { ReportLockService } from "../src/features/report/report-lock.service.js";
import { ReportUploadSessionRepository } from "../src/features/report/report-upload-session.repository.js";
import { ReportUploadSessionService } from "../src/features/report/report-upload-session.service.js";
import { UploadRepository } from "../src/features/upload/upload.repository.js";
import { signAccessToken } from "../src/utils/auth/jwt.util.js";
import { ResponseError } from "../src/utils/errors/response-error.util.js";
import * as storageAdapter from "../src/utils/storage/storage.adapter.js";
import { invokeApp } from "./helpers/invoke-app.helper.js";

vi.mock("../src/configs/prisma-client.config.js", () => ({ prisma: {} }));

interface ApiEnvelope<T = Record<string, unknown>> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

const AREA_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const REPORT_ID = "33333333-3333-4333-8333-333333333333";
const SESSION_ID = "44444444-4444-4444-8444-444444444444";

function supHeader(sub = "sup-1") {
  const token = signAccessToken({
    sub,
    role: Role.SUPERVISOR,
    username: "sup1",
    name: "Budi Pengawas",
    jobTitle: "Supervisor",
  });
  return { Authorization: `Bearer ${token}` };
}

function mockArea(supervisorId: string, endDate: Date | null = null) {
  return vi.spyOn(UploadRepository, "findAreaWithAssignments").mockResolvedValue({
    id: AREA_ID,
    projectId: PROJECT_ID,
    project: { id: PROJECT_ID, code: "VLA01" },
    assignments: [
      {
        id: "asg-1",
        supervisorId,
        startDate: new Date("2026-11-01T00:00:00.000Z"),
        endDate,
      },
    ],
  });
}

describe("TASK-06 Upload R2 & Progressive Lock", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("menolak supervisor mengakses area lain (AC-07.1, BR-03)", async () => {
    mockArea("sup-lain");
    const signRes = await invokeApp<ApiEnvelope>(app, {
      method: "POST",
      path: "/api/v1/uploads/sign",
      headers: supHeader("sup-1"),
      body: {
        areaId: AREA_ID,
        sessionId: SESSION_ID,
        reportDate: "2026-11-16",
        files: [{ contentType: "image/jpeg", fileSizeBytes: 250_000 }],
      },
    });
    expect(signRes.status).toBe(403);
    expect(signRes.body.error?.code).toBe("AREA_SCOPE_FORBIDDEN");

    vi.spyOn(UploadRepository, "findReportWithPhotosAndScope").mockResolvedValue({
      id: REPORT_ID,
      areaId: AREA_ID,
      supervisorId: "sup-lain",
      photos: [],
      area: {
        project: { siteManagerId: null },
        assignments: [{ supervisorId: "sup-lain" }],
      },
    });
    const viewRes = await invokeApp<ApiEnvelope>(app, {
      method: "POST",
      path: "/api/v1/uploads/view-urls",
      headers: supHeader("sup-1"),
      body: { reportId: REPORT_ID },
    });
    expect(viewRes.status).toBe(403);
    expect(viewRes.body.error?.code).toBe("AREA_SCOPE_FORBIDDEN");
  });

  it("menolak sign upload di luar rentang penugasan (BR-10)", async () => {
    mockArea("sup-1", new Date("2026-11-09T00:00:00.000Z"));
    const res = await invokeApp<ApiEnvelope>(app, {
      method: "POST",
      path: "/api/v1/uploads/sign",
      headers: supHeader("sup-1"),
      body: {
        areaId: AREA_ID,
        sessionId: SESSION_ID,
        reportDate: "2026-11-10",
        files: [{ contentType: "image/jpeg", fileSizeBytes: 200_000 }],
      },
    });
    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe("ASSIGNMENT_ENDED");
  });

  it("memvalidasi jumlah foto 1..10, tipe file, dan mengembalikan presigned PUT URL (AC-08.2, BR-16)", async () => {
    const emptyRes = await invokeApp<ApiEnvelope>(app, {
      method: "POST",
      path: "/api/v1/uploads/sign",
      headers: supHeader("sup-1"),
      body: { areaId: AREA_ID, sessionId: SESSION_ID, reportDate: "2026-11-16", files: [] },
    });
    expect(emptyRes.status).toBe(400);
    expect(emptyRes.body.error?.code).toBe("INVALID_PHOTO_COUNT");

    mockArea("sup-1");
    vi.spyOn(ReportUploadSessionService, "assertCanSign").mockResolvedValue({ id: SESSION_ID } as never);
    vi.spyOn(ReportUploadSessionRepository, "addPhoto").mockResolvedValue({} as never);
    const badMimeRes = await invokeApp<ApiEnvelope>(app, {
      method: "POST",
      path: "/api/v1/uploads/sign",
      headers: supHeader("sup-1"),
      body: {
        areaId: AREA_ID,
        sessionId: SESSION_ID,
        reportDate: "2026-11-16",
        files: [{ contentType: "application/pdf", fileSizeBytes: 120_000 }],
      },
    });
    expect(badMimeRes.status).toBe(400);
    expect(badMimeRes.body.error?.code).toBe("UNSUPPORTED_FILE_TYPE");

    vi.spyOn(storageAdapter, "createSignedUploadUrl").mockImplementation(async ({ storageKey }) => ({
      uploadUrl: `https://r2.example.test/${storageKey}?sig=ok`,
      storageKey,
      expiresInSeconds: 300,
    }));
    const okRes = await invokeApp<
      ApiEnvelope<Array<{ uploadUrl: string; storageKey: string }>>
    >(app, {
      method: "POST",
      path: "/api/v1/uploads/sign",
      headers: supHeader("sup-1"),
      body: {
        areaId: AREA_ID,
        sessionId: SESSION_ID,
        reportDate: "2026-11-16",
        files: [{ contentType: "image/webp", fileSizeBytes: 180_000 }],
      },
    });
    expect(okRes.status).toBe(200);
    expect(okRes.body.data?.[0]?.storageKey).toContain(`projects/${PROJECT_ID}/areas/${AREA_ID}/2026-11-16/`);
    expect(okRes.body.data?.[0]?.uploadUrl).toContain("https://r2.example.test/");
  });

  it("menghitung kunci bertahap urut terlama, melewati libur rutin, dan melempar 423 (AC-10.1, BR-11, BR-20)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-16T04:00:00.000Z"));
    vi.spyOn(ReportLockRepository, "findActiveAssignmentsForSupervisor").mockResolvedValue([
      {
        id: "asg-1",
        startDate: new Date("2026-11-12T00:00:00.000Z"),
        endDate: null,
        area: {
          id: AREA_ID,
          code: "A",
          name: "Area A - Struktur",
          project: {
            id: PROJECT_ID,
            code: "VLA01",
            name: "Villa Ubud",
            location: "Gianyar",
            startDate: new Date("2026-11-12T00:00:00.000Z"),
            endDate: null,
            timezone: "Asia/Jakarta",
            routineHolidays: [0],
          },
          reports: [
            { id: "rep-1", reportDate: new Date("2026-11-12T00:00:00.000Z"), status: ReportStatus.SUBMITTED, supervisorId: "sup-1" },
          ],
          unlocks: [],
        },
      },
    ]);
    const res = await invokeApp<
      ApiEnvelope<Array<{ pendingDates: string[]; nextRequiredDate: string; isTodayLocked: boolean }>>
    >(app, { method: "GET", path: "/api/v1/reports/my-areas-status", headers: supHeader("sup-1") });
    expect(res.status).toBe(200);
    const areaStatus = res.body.data?.[0];
    expect(areaStatus?.pendingDates).toEqual(["2026-11-13", "2026-11-14", "2026-11-16"]);
    expect(areaStatus?.nextRequiredDate).toBe("2026-11-13");
    expect(areaStatus?.isTodayLocked).toBe(true);
    expect(() =>
      ReportLockService.assertDateUnlocked(areaStatus?.pendingDates ?? [], "2026-11-16"),
    ).toThrowError(ResponseError);
  });
});
