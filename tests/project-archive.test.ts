import { ProjectStatus, Role } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { ProjectRepository } from "../src/features/project/project.repository.js";
import { ProjectService } from "../src/features/project/project.service.js";
import type { AuthenticatedUser } from "../src/types/express.d.js";
import { signAccessToken } from "../src/utils/auth/jwt.util.js";
import { invokeApp } from "./helpers/invoke-app.helper.js";

vi.mock("../src/configs/prisma-client.config.js", () => ({ prisma: {} }));

interface ApiEnvelope<T = unknown> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

const ownerActor: AuthenticatedUser = { id: "u-owner", role: Role.OWNER, username: "owner", name: "Owner", jobTitle: "Owner" };
const adminActor: AuthenticatedUser = { id: "u-admin", role: Role.ADMIN, username: "admin", name: "Admin", jobTitle: "Admin" };
const supActor: AuthenticatedUser = { id: "u-sup", role: Role.SUPERVISOR, username: "sup", name: "Sup", jobTitle: "Supervisor" };

const makeToken = (actor: AuthenticatedUser) =>
  signAccessToken({ sub: actor.id, role: actor.role, username: actor.username, name: actor.name, jobTitle: actor.jobTitle });

function makeProject(overrides?: Partial<{
  id: string;
  status: ProjectStatus;
  completedAt: Date | null;
  archivedAt: Date | null;
}>) {
  const now = new Date("2026-11-19T00:00:00.000Z");
  return {
    id: overrides?.id ?? "proj-1",
    code: "VLA01",
    name: "Villa Ubud",
    location: "Ubud",
    clientName: "PT Graha",
    startDate: new Date("2026-01-01T00:00:00.000Z"),
    endDate: null,
    status: overrides?.status ?? ProjectStatus.BERJALAN,
    timezone: "Asia/Makassar",
    routineHolidays: [0],
    completedAt: overrides?.completedAt ?? null,
    archivedAt: overrides?.archivedAt ?? null,
    createdAt: now,
    updatedAt: now,
    areas: [],
  };
}

describe("TASK-17 Archive Project — Complete, Manual Archive, Restore & RBAC (US-22, BR-12, BR-39)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("[AC-22.1 / BR-12, BR-39] OWNER menandai project SELESAI (POST /:id/complete) -> completedAt terisi", async () => {
    vi.spyOn(ProjectRepository, "findById").mockResolvedValue(makeProject());
    const completedAt = new Date("2026-11-19T12:00:00.000Z");
    const completeSpy = vi
      .spyOn(ProjectRepository, "markCompleted")
      .mockResolvedValue(makeProject({ status: ProjectStatus.SELESAI, completedAt }));

    const res = await invokeApp<ApiEnvelope<{ status: string }>>(app, {
      method: "POST",
      path: "/api/v1/projects/proj-1/complete",
      headers: { Authorization: `Bearer ${makeToken(ownerActor)}` },
    });

    expect(res.status).toBe(200);
    expect(res.body.data?.status).toBe("SELESAI");
    expect(completeSpy).toHaveBeenCalledTimes(1);
  });

  it("[AC-22.1 / BR-39] OWNER mengarsipkan manual (POST /:id/archive) -> archivedAt terisi", async () => {
    vi.spyOn(ProjectRepository, "findById").mockResolvedValue(makeProject());
    const archivedAt = new Date("2026-11-19T12:00:00.000Z");
    const archiveSpy = vi
      .spyOn(ProjectRepository, "markArchived")
      .mockResolvedValue(makeProject({ archivedAt }));

    const res = await invokeApp<ApiEnvelope<{ archivedAt: string }>>(app, {
      method: "POST",
      path: "/api/v1/projects/proj-1/archive",
      headers: { Authorization: `Bearer ${makeToken(ownerActor)}` },
    });

    expect(res.status).toBe(200);
    expect(res.body.data?.archivedAt).toBe(archivedAt.toISOString());
    expect(archiveSpy).toHaveBeenCalledTimes(1);
  });

  it("[AC-22.1 / BR-39] OWNER memulihkan project (POST /:id/restore) dengan PERSIAPAN/BERJALAN; tolak SELESAI & project aktif", async () => {
    vi.spyOn(ProjectRepository, "findById").mockResolvedValueOnce(
      makeProject({ status: ProjectStatus.SELESAI, completedAt: new Date("2025-12-01T00:00:00.000Z") }),
    );
    const restoreSpy = vi
      .spyOn(ProjectRepository, "restoreProject")
      .mockResolvedValue(makeProject({ status: ProjectStatus.PERSIAPAN }));

    const okRes = await invokeApp<ApiEnvelope<{ status: string }>>(app, {
      method: "POST",
      path: "/api/v1/projects/proj-1/restore",
      headers: { Authorization: `Bearer ${makeToken(ownerActor)}` },
      body: { status: "PERSIAPAN" },
    });
    expect(okRes.status).toBe(200);
    expect(okRes.body.data?.status).toBe("PERSIAPAN");
    expect(restoreSpy).toHaveBeenCalledWith("proj-1", ProjectStatus.PERSIAPAN);

    const invalidStatus = await invokeApp<ApiEnvelope>(app, {
      method: "POST",
      path: "/api/v1/projects/proj-1/restore",
      headers: { Authorization: `Bearer ${makeToken(ownerActor)}` },
      body: { status: "SELESAI" },
    });
    expect(invalidStatus.status).toBe(422);
    expect(invalidStatus.body.error?.code).toBe("VALIDATION_ERROR");

    vi.spyOn(ProjectRepository, "findById").mockResolvedValueOnce(makeProject());
    await expect(
      ProjectService.restoreProject(ownerActor, "proj-1", { status: ProjectStatus.BERJALAN }),
    ).rejects.toMatchObject({ code: "CONFLICT", statusCode: 409 });
  });

  it("[AC-22.1 / BR-39] GET /projects/archive memfilter tahun tindakan & menolak SUPERVISOR (403)", async () => {
    vi.spyOn(ProjectRepository, "findArchived").mockResolvedValue([
      makeProject({ id: "p-2026", status: ProjectStatus.SELESAI, completedAt: new Date("2026-06-10T05:00:00.000Z") }),
      makeProject({ id: "p-2025", status: ProjectStatus.BERJALAN, archivedAt: new Date("2025-08-20T05:00:00.000Z") }),
    ]);

    const adminRes = await invokeApp<ApiEnvelope<Array<{ id: string; archiveYear: number; archiveType: string }>>>(app, {
      method: "GET",
      path: "/api/v1/projects/archive?year=2025",
      headers: { Authorization: `Bearer ${makeToken(adminActor)}` },
    });
    expect(adminRes.status).toBe(200);
    expect(adminRes.body.data).toHaveLength(1);
    expect(adminRes.body.data?.[0]?.id).toBe("p-2025");
    expect(adminRes.body.data?.[0]?.archiveType).toBe("MANUAL");
    expect(adminRes.body.data?.[0]?.archiveYear).toBe(2025);

    const supRes = await invokeApp<ApiEnvelope>(app, {
      method: "GET",
      path: "/api/v1/projects/archive",
      headers: { Authorization: `Bearer ${makeToken(supActor)}` },
    });
    expect(supRes.status).toBe(403);
    expect(supRes.body.error?.code).toBe("FORBIDDEN");
  });

  it("[AC-22.1 / BR-39] ADMIN ditolak 403 FORBIDDEN untuk complete, archive, dan restore", async () => {
    const headers = { Authorization: `Bearer ${makeToken(adminActor)}` };
    const [cRes, aRes, rRes] = await Promise.all([
      invokeApp<ApiEnvelope>(app, { method: "POST", path: "/api/v1/projects/proj-1/complete", headers }),
      invokeApp<ApiEnvelope>(app, { method: "POST", path: "/api/v1/projects/proj-1/archive", headers }),
      invokeApp<ApiEnvelope>(app, { method: "POST", path: "/api/v1/projects/proj-1/restore", headers, body: { status: "BERJALAN" } }),
    ]);
    expect([cRes.status, aRes.status, rRes.status]).toEqual([403, 403, 403]);
  });

  it("[BR-12 / BR-39] PATCH menolak mutasi project arsip (422) & form create menolak status SELESAI", async () => {
    vi.spyOn(ProjectRepository, "findById").mockResolvedValue(
      makeProject({ archivedAt: new Date("2026-11-19T00:00:00.000Z") }),
    );
    await expect(
      ProjectService.updateProject(ownerActor, "proj-1", { name: "Ubah Arsip" }),
    ).rejects.toMatchObject({ code: "PROJECT_ALREADY_COMPLETED", statusCode: 422 });

    const invalidCreate = await invokeApp<ApiEnvelope>(app, {
      method: "POST",
      path: "/api/v1/projects",
      headers: { Authorization: `Bearer ${makeToken(ownerActor)}` },
      body: {
        code: "VLA99",
        name: "Villa Selesai Langsung",
        location: "Ubud",
        clientName: "PT Test",
        startDate: "2026-11-01",
        status: "SELESAI",
      },
    });
    expect(invalidCreate.status).toBe(422);
    expect(invalidCreate.body.error?.code).toBe("VALIDATION_ERROR");
  });
});
