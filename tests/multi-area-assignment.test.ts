import { ProjectStatus, Role } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { AreaRepository } from "../src/features/area/area.repository.js";
import { AreaService } from "../src/features/area/area.service.js";
import { ProjectRepository } from "../src/features/project/project.repository.js";
import { UserRepository } from "../src/features/user/user.repository.js";
import { signAccessToken } from "../src/utils/auth/jwt.util.js";
import { invokeApp } from "./helpers/invoke-app.helper.js";

const mockFindManyAreas = vi.hoisted(() => vi.fn());
vi.mock("../src/configs/prisma-client.config.js", () => ({
  prisma: { area: { findMany: mockFindManyAreas } },
}));

interface ApiEnvelope {
  success: boolean;
  error?: { code: string; message: string };
}

const now = new Date();
const ownerActor = { id: "user-owner-1", role: Role.OWNER, username: "owner1", name: "Owner", jobTitle: "Owner" };
const supervisorActor = { id: "user-sup-1", role: Role.SUPERVISOR, username: "sup1", name: "Supervisor 1", jobTitle: "Supervisor" };
const activeSupervisor = {
  id: "user-sup-1",
  name: "Supervisor 1",
  username: "sup1",
  phone: "081234567890",
  role: Role.SUPERVISOR,
  jobTitle: "Supervisor Lapangan",
  isActive: true,
  createdAt: now,
  updatedAt: now,
};
const baseProject = {
  id: "proj-1",
  code: "VLA01",
  name: "Villa Ubud",
  location: "Ubud",
  clientName: "PT Graha",
  startDate: new Date("2026-11-01T00:00:00.000Z"),
  endDate: null,
  status: ProjectStatus.BERJALAN,
  timezone: "Asia/Makassar",
  routineHolidays: [0],
  createdAt: now,
  updatedAt: now,
  areas: [],
};

function buildArea(id: string, projectId: string, code: string, overrides?: {
  status?: ProjectStatus;
  archivedAt?: Date | null;
  withActiveSupervisor?: boolean;
}) {
  return {
    id,
    projectId,
    code,
    name: `Area ${code}`,
    createdAt: now,
    updatedAt: now,
    project: { status: overrides?.status ?? ProjectStatus.BERJALAN, archivedAt: overrides?.archivedAt ?? null },
    activeAssignment: overrides?.withActiveSupervisor
      ? { id: "assign-1", supervisorId: "user-sup-1", startDate: new Date("2026-11-01T00:00:00.000Z"), endDate: null, supervisor: activeSupervisor }
      : null,
  };
}

describe("TASK-11 Penugasan Multi-Area & Scope Aktif Supervisor (US-24, BR-09)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockFindManyAreas.mockReset();
  });

  it("[AC-24.1 / BR-09] Owner/Admin dapat menugaskan supervisor yang sama ke beberapa area/project berbeda", async () => {
    vi.spyOn(UserRepository, "findById").mockResolvedValue(activeSupervisor);
    vi.spyOn(AreaRepository, "findById")
      .mockResolvedValueOnce(buildArea("area-p1-b", "proj-1", "B"))
      .mockResolvedValueOnce(buildArea("area-p2-a", "proj-2", "A"));

    const replaceSpy = vi.spyOn(AreaRepository, "replaceSupervisorAssignment").mockImplementation(async (input) => ({
      id: `assign-${input.areaId}`,
      supervisorId: input.newSupervisorId,
      startDate: input.effectiveStartDate,
      endDate: null,
      supervisor: activeSupervisor,
    }));

    const first = await AreaService.assignSupervisor(ownerActor, "area-p1-b", {
      supervisorId: "user-sup-1",
      effectiveStartDate: "2026-11-12",
    });
    const second = await AreaService.assignSupervisor(ownerActor, "area-p2-a", {
      supervisorId: "user-sup-1",
      effectiveStartDate: "2026-11-12",
    });

    expect(first.supervisorId).toBe("user-sup-1");
    expect(second.supervisorId).toBe("user-sup-1");
    expect(replaceSpy).toHaveBeenCalledTimes(2);
  });

  it("[AC-24.1 / BR-03, BR-09] AreaRepository.findManyByProjectId menyaring penugasan aktif (endDate: null) untuk SUPERVISOR", async () => {
    mockFindManyAreas.mockResolvedValue([]);
    await AreaRepository.findManyByProjectId("proj-1", "user-sup-1");

    expect(mockFindManyAreas).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          projectId: "proj-1",
          deletedAt: null,
          assignments: { some: { supervisorId: "user-sup-1", endDate: null } },
        }),
      }),
    );
  });

  it("[AC-24.2 / BR-03, BR-09] SUPERVISOR ditolak 403 AREA_SCOPE_FORBIDDEN pada project tanpa area aktif", async () => {
    vi.spyOn(ProjectRepository, "findById").mockResolvedValue(baseProject);
    vi.spyOn(AreaRepository, "findManyByProjectId").mockResolvedValue([]);

    await expect(AreaService.getAreasByProject(supervisorActor, "proj-1")).rejects.toMatchObject({
      code: "AREA_SCOPE_FORBIDDEN",
      statusCode: 403,
    });
  });

  it("[AC-24.2 / BR-09] SUPERVISOR ditolak 403 FORBIDDEN pada POST & GET /api/v1/areas/:areaId/assignments", async () => {
    const supToken = signAccessToken({
      sub: supervisorActor.id,
      role: supervisorActor.role,
      username: supervisorActor.username,
      name: supervisorActor.name,
      jobTitle: supervisorActor.jobTitle,
    });

    const postRes = await invokeApp<ApiEnvelope>(app, {
      method: "POST",
      path: "/api/v1/areas/area-1/assignments",
      headers: { Authorization: `Bearer ${supToken}` },
      body: { supervisorId: "user-sup-1", effectiveStartDate: "2026-11-15" },
    });
    const getRes = await invokeApp<ApiEnvelope>(app, {
      method: "GET",
      path: "/api/v1/areas/area-1/assignments",
      headers: { Authorization: `Bearer ${supToken}` },
    });

    expect(postRes.status).toBe(403);
    expect(postRes.body.error?.code).toBe("FORBIDDEN");
    expect(getRes.status).toBe(403);
    expect(getRes.body.error?.code).toBe("FORBIDDEN");
  });

  it("[BR-08 / BR-10] Menolak 409 CONFLICT bila menugaskan supervisor yang sudah aktif di area yang sama", async () => {
    vi.spyOn(UserRepository, "findById").mockResolvedValue(activeSupervisor);
    vi.spyOn(AreaRepository, "findById").mockResolvedValue(
      buildArea("area-1", "proj-1", "A", { withActiveSupervisor: true }),
    );

    await expect(
      AreaService.assignSupervisor(ownerActor, "area-1", {
        supervisorId: "user-sup-1",
        effectiveStartDate: "2026-11-10",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT", statusCode: 409 });
  });

  it("[BR-12 / BR-39] Menolak 422 PROJECT_ALREADY_COMPLETED saat mutasi area/penugasan pada project selesai atau arsip", async () => {
    vi.spyOn(ProjectRepository, "findById").mockResolvedValue({ ...baseProject, status: ProjectStatus.SELESAI });
    await expect(
      AreaService.createArea(ownerActor, "proj-1", {
        code: "C",
        name: "Area Arsip",
        initialSupervisorId: "user-sup-1",
        startDate: "2026-11-10",
      }),
    ).rejects.toMatchObject({ code: "PROJECT_ALREADY_COMPLETED", statusCode: 422 });

    vi.spyOn(AreaRepository, "findById").mockResolvedValue(
      buildArea("area-1", "proj-1", "A", { archivedAt: new Date("2026-11-18T00:00:00.000Z") }),
    );
    await expect(
      AreaService.assignSupervisor(ownerActor, "area-1", {
        supervisorId: "user-sup-1",
        effectiveStartDate: "2026-11-19",
      }),
    ).rejects.toMatchObject({ code: "PROJECT_ALREADY_COMPLETED", statusCode: 422 });
  });
});
