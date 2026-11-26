import { ProjectStatus, ReportStatus, Role } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { AreaRepository } from "../src/features/area/area.repository.js";
import { AreaService } from "../src/features/area/area.service.js";
import { ProjectRepository } from "../src/features/project/project.repository.js";
import { ProjectService } from "../src/features/project/project.service.js";
import { assertCanReadReport, buildReportsWhere } from "../src/features/report/report.guard.js";
import { UploadRepository } from "../src/features/upload/upload.repository.js";
import { UploadSessionRepository } from "../src/features/upload/upload-session.repository.js";
import { UserRepository } from "../src/features/user/user.repository.js";
import type { AuthenticatedUser } from "../src/types/express.d.js";
import { signAccessToken } from "../src/utils/auth/jwt.util.js";
import * as driveSessionCrypto from "../src/utils/storage/drive-session.crypto.js";
import * as driveUploadAdapter from "../src/utils/storage/drive-upload.adapter.js";
import { invokeApp } from "./helpers/invoke-app.helper.js";
import { makeReportRecord } from "./helpers/report-fixture.helper.js";

vi.mock("../src/configs/prisma-client.config.js", () => ({ prisma: {} }));

interface ApiEnvelope<T = unknown> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

const PROJ_ID = "11111111-1111-4111-8111-111111111111";
const SM_ID = "22222222-2222-4222-8222-222222222222";
const now = new Date("2026-11-24T00:00:00.000Z");

const ownerActor: AuthenticatedUser = { id: "u-owner", role: Role.OWNER, username: "owner", name: "Owner", jobTitle: "Owner" };
const smActor: AuthenticatedUser = { id: SM_ID, role: Role.SITE_MANAGER, username: "sm1", name: "Budi SM", jobTitle: "Site Manager" };
const supActor: AuthenticatedUser = { id: "u-sup", role: Role.SUPERVISOR, username: "sup1", name: "Agus Sup", jobTitle: "Supervisor" };

const authHeader = (actor: AuthenticatedUser) => ({
  Authorization: `Bearer ${signAccessToken({
    sub: actor.id,
    role: actor.role,
    username: actor.username,
    name: actor.name,
    jobTitle: actor.jobTitle,
  })}`,
});

describe("REV-01..REV-04 Site Manager Flow, Area Assignment & 4-Role Comms Upload", () => {
  afterEach(() => vi.restoreAllMocks());

  it("[BR-41 / D-01, K-03] Project validasi siteManagerId aktif berperan SITE_MANAGER", async () => {
    vi.spyOn(ProjectRepository, "findByCode").mockResolvedValue(false);
    vi.spyOn(UserRepository, "findById").mockResolvedValue({
      id: SM_ID, name: "Salah Role", username: "sup", phone: "08123", role: Role.SUPERVISOR,
      jobTitle: "Supervisor", isActive: true, createdAt: now, updatedAt: now,
    });

    await expect(
      ProjectService.createProject(ownerActor, {
        code: "PRJ01", name: "Proyek 1", location: "Jakarta", clientName: "Klien",
        startDate: "2026-11-24", status: ProjectStatus.PERSIAPAN, timezone: "Asia/Jakarta",
        routineHolidays: [0], siteManagerId: SM_ID,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", statusCode: 422 });
  });

  it("[K-01] AreaAssignment menerima SITE_MANAGER aktif; SITE_MANAGER dilarang melakukan plotting", async () => {
    vi.spyOn(AreaRepository, "findById").mockResolvedValue({
      id: "area-1", projectId: PROJ_ID, code: "A", name: "Area A", createdAt: now, updatedAt: now,
      activeAssignment: null,
      project: { status: ProjectStatus.BERJALAN, archivedAt: null },
    });
    vi.spyOn(UserRepository, "findById").mockResolvedValue({
      id: SM_ID, name: "Budi SM", username: "sm1", phone: "081234", role: Role.SITE_MANAGER,
      jobTitle: "Site Manager", isActive: true, createdAt: now, updatedAt: now,
    });
    vi.spyOn(AreaRepository, "replaceSupervisorAssignment").mockResolvedValue({
      id: "asg-sm", supervisorId: SM_ID, startDate: now, endDate: null,
      supervisor: { id: SM_ID, name: "Budi SM", username: "sm1", phone: "081234", jobTitle: "Site Manager" },
    });

    const assigned = await AreaService.assignSupervisor(ownerActor, "area-1", {
      supervisorId: SM_ID, effectiveStartDate: "2026-11-24",
    });
    expect(assigned.supervisorId).toBe(SM_ID);

    await expect(
      AreaService.assignSupervisor(smActor, "area-1", {
        supervisorId: "u-sup", effectiveStartDate: "2026-11-24",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", statusCode: 403 });
  });

  it("[BR-03 / BR-41 / K-01] SITE_MANAGER dapat membaca laporan tim di project yang dipegang & filter scope own/team", () => {
    const teamReport = makeReportRecord({ status: ReportStatus.SUBMITTED });
    teamReport.area.project.siteManagerId = SM_ID;
    expect(() => assertCanReadReport(teamReport, smActor)).not.toThrow();

    const otherProjectReport = makeReportRecord({ status: ReportStatus.SUBMITTED });
    otherProjectReport.area.project.siteManagerId = "other-sm";
    expect(() => assertCanReadReport(otherProjectReport, smActor)).toThrowError();

    const ownWhere = buildReportsWhere(
      { page: 1, pageSize: 10, sortBy: "reportDate", sortOrder: "desc", scope: "own" },
      smActor,
    );
    expect(ownWhere.AND).toEqual([{ supervisorId: SM_ID }]);

    const teamWhere = buildReportsWhere(
      { page: 1, pageSize: 10, sortBy: "reportDate", sortOrder: "desc", scope: "team" },
      smActor,
    );
    expect(teamWhere.AND).toEqual([
      { area: { project: { siteManagerId: SM_ID } }, supervisorId: { not: SM_ID } },
    ]);
  });

  it("[BR-35 / K-02] POST /uploads/sessions purpose comms-attachment mengizinkan SITE_MANAGER & SUPERVISOR sesuai scope project", async () => {
    vi.spyOn(ProjectRepository, "findById").mockResolvedValue({
      id: PROJ_ID, code: "VLA01", name: "Villa", location: "Bali", clientName: "Klien",
      startDate: now, endDate: null, status: ProjectStatus.BERJALAN, timezone: "Asia/Jakarta",
      routineHolidays: [0], siteManagerId: SM_ID, completedAt: null, archivedAt: null,
      createdAt: now, updatedAt: now, areas: [],
    });
    vi.spyOn(UploadRepository, "projectAcceptsFiles").mockResolvedValue(true);
    vi.spyOn(driveUploadAdapter, "createDriveUploadSession").mockResolvedValue("https://www.googleapis.com/upload/drive/v3/files?upload_id=session-1");
    vi.spyOn(driveSessionCrypto, "encryptDriveSessionUri").mockReturnValue("enc:session-1");
    vi.spyOn(UploadSessionRepository, "create").mockResolvedValue({
      storedFile: { id: "sf-comms-1" },
      uploadSession: { id: "us-comms-1" },
    } as never);

    const [smRes, supRes] = await Promise.all([
      invokeApp<ApiEnvelope<{ storedFileId: string; uploadSessionId: string }>>(app, {
        method: "POST",
        path: "/api/v1/uploads/sessions",
        headers: authHeader(smActor),
        body: {
          purpose: "comms-attachment",
          projectId: PROJ_ID,
          file: { fileName: "nota.pdf", contentType: "application/pdf", fileSizeBytes: 100_000 },
        },
      }),
      invokeApp<ApiEnvelope<{ storedFileId: string; uploadSessionId: string }>>(app, {
        method: "POST",
        path: "/api/v1/uploads/sessions",
        headers: authHeader(supActor),
        body: {
          purpose: "comms-attachment",
          projectId: PROJ_ID,
          file: { fileName: "memo.pdf", contentType: "application/pdf", fileSizeBytes: 100_000 },
        },
      }),
    ]);

    expect(smRes.status).toBe(201);
    expect(supRes.status).toBe(201);
    expect(smRes.body.data?.storedFileId).toBe("sf-comms-1");
    expect(supRes.body.data?.uploadSessionId).toBe("us-comms-1");
  });
});
