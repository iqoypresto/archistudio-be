import { Role } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { AreaRepository } from "../src/features/area/area.repository.js";
import { AreaService } from "../src/features/area/area.service.js";
import { ProjectRepository } from "../src/features/project/project.repository.js";
import { UserRepository } from "../src/features/user/user.repository.js";
import { signAccessToken } from "../src/utils/auth/jwt.util.js";
import { invokeApp } from "./helpers/invoke-app.helper.js";

vi.mock("../src/configs/prisma-client.config.js", () => ({
  prisma: {},
}));

interface ApiEnvelope<T = Record<string, unknown>> {
  success: boolean;
  message?: string;
  data?: T;
  error?: { code: string; message: string };
}

describe("TASK-05 Area & Supervisor Assignment — Unit & Integration Tests", () => {
  const adminActor = {
    id: "user-admin-1",
    role: Role.ADMIN,
    username: "admin1",
    name: "Admin Proyek",
    jobTitle: "Admin",
  };

  const supervisorActor = {
    id: "user-sup-1",
    role: Role.SUPERVISOR,
    username: "sup1",
    name: "Supervisor 1",
    jobTitle: "Supervisor",
  };

  const mockProject = {
    id: "proj-1",
    code: "VLA01",
    name: "Villa Ubud",
    location: "Ubud",
    clientName: "PT Graha",
    startDate: new Date("2026-11-01T00:00:00.000Z"),
    endDate: null,
    status: "BERJALAN" as const,
    timezone: "Asia/Makassar",
    routineHolidays: [0],
    createdAt: new Date(),
    updatedAt: new Date(),
    areas: [],
  };

  const mockSupervisorUser = {
    id: "user-sup-1",
    name: "Supervisor 1",
    username: "sup1",
    phone: "081234567890",
    role: Role.SUPERVISOR,
    jobTitle: "Supervisor Lapangan",
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it("[AC-05.1 / BR-08, BR-13] Owner/Admin berhasil membuat area baru dengan supervisor aktif awal", async () => {
    vi.spyOn(ProjectRepository, "findById").mockResolvedValue(mockProject);
    vi.spyOn(AreaRepository, "findByCodeInProject").mockResolvedValue(false);
    vi.spyOn(UserRepository, "findById").mockResolvedValue(mockSupervisorUser);

    const createSpy = vi
      .spyOn(AreaRepository, "createWithInitialAssignment")
      .mockResolvedValue({
        id: "area-1",
        projectId: "proj-1",
        code: "A",
        name: "Area Utama",
        createdAt: new Date(),
        updatedAt: new Date(),
        activeAssignment: {
          id: "assign-1",
          supervisorId: "user-sup-1",
          startDate: new Date("2026-11-01T00:00:00.000Z"),
          endDate: null,
          supervisor: {
            id: "user-sup-1",
            name: "Supervisor 1",
            username: "sup1",
            phone: "081234567890",
            jobTitle: "Supervisor Lapangan",
          },
        },
      });

    const area = await AreaService.createArea(adminActor, "proj-1", {
      code: "a",
      name: "Area Utama",
      initialSupervisorId: "user-sup-1",
      startDate: "2026-11-01",
    });

    expect(area.id).toBe("area-1");
    expect(area.code).toBe("A");
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "a",
        name: "Area Utama",
        supervisorId: "user-sup-1",
      }),
    );
  });

  it("[BR-13 / CONFLICT] Menolak jika kode area sudah digunakan dalam project yang sama (409)", async () => {
    vi.spyOn(ProjectRepository, "findById").mockResolvedValue(mockProject);
    vi.spyOn(AreaRepository, "findByCodeInProject").mockResolvedValue(true);

    await expect(
      AreaService.createArea(adminActor, "proj-1", {
        code: "A",
        name: "Area Duplikat",
        initialSupervisorId: "user-sup-1",
        startDate: "2026-11-01",
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      statusCode: 409,
    });
  });

  it("[Validation] Menolak jika supervisor awal tidak ditemukan atau tidak aktif", async () => {
    vi.spyOn(ProjectRepository, "findById").mockResolvedValue(mockProject);
    vi.spyOn(AreaRepository, "findByCodeInProject").mockResolvedValue(false);
    vi.spyOn(UserRepository, "findById").mockResolvedValue(null);

    await expect(
      AreaService.createArea(adminActor, "proj-1", {
        code: "B",
        name: "Area B",
        initialSupervisorId: "non-existent-sup",
        startDate: "2026-11-01",
      }),
    ).rejects.toMatchObject({
      code: "SUPERVISOR_NOT_ACTIVE",
      statusCode: 400,
    });
  });

  it("[AC-06.1 / BR-08, BR-10] Berhasil mengganti supervisor, menutup penugasan lama H-1 & buat baru", async () => {
    vi.spyOn(AreaRepository, "findById").mockResolvedValue({
      id: "area-1",
      projectId: "proj-1",
      code: "A",
      name: "Area Utama",
      createdAt: new Date(),
      updatedAt: new Date(),
      activeAssignment: {
        id: "assign-1",
        supervisorId: "user-sup-1",
        startDate: new Date("2026-11-01T00:00:00.000Z"),
        endDate: null,
        supervisor: {
          id: "user-sup-1",
          name: "Supervisor 1",
          username: "sup1",
          phone: "081234567890",
          jobTitle: "Supervisor",
        },
      },
    });

    vi.spyOn(UserRepository, "findById").mockResolvedValue({
      id: "user-sup-2",
      name: "Supervisor 2",
      username: "sup2",
      phone: "081299998888",
      role: Role.SUPERVISOR,
      jobTitle: "Supervisor Baru",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const replaceSpy = vi
      .spyOn(AreaRepository, "replaceSupervisorAssignment")
      .mockResolvedValue({
        id: "assign-2",
        supervisorId: "user-sup-2",
        startDate: new Date("2026-11-10T00:00:00.000Z"),
        endDate: null,
        supervisor: {
          id: "user-sup-2",
          name: "Supervisor 2",
          username: "sup2",
          phone: "081299998888",
          jobTitle: "Supervisor Baru",
        },
      });

    const updated = await AreaService.assignSupervisor(adminActor, "area-1", {
      supervisorId: "user-sup-2",
      effectiveStartDate: "2026-11-10",
    });

    expect(updated.id).toBe("assign-2");
    expect(replaceSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        areaId: "area-1",
        activeAssignmentId: "assign-1",
        previousEndDate: new Date("2026-11-09T00:00:00.000Z"),
        newSupervisorId: "user-sup-2",
        effectiveStartDate: new Date("2026-11-10T00:00:00.000Z"),
      }),
    );
  });

  it("[BR-10 / INVALID_ASSIGNMENT_DATE] Menolak jika effectiveStartDate <= startDate penugasan aktif (400)", async () => {
    vi.spyOn(AreaRepository, "findById").mockResolvedValue({
      id: "area-1",
      projectId: "proj-1",
      code: "A",
      name: "Area Utama",
      createdAt: new Date(),
      updatedAt: new Date(),
      activeAssignment: {
        id: "assign-1",
        supervisorId: "user-sup-1",
        startDate: new Date("2026-11-05T00:00:00.000Z"),
        endDate: null,
        supervisor: {
          id: "user-sup-1",
          name: "Supervisor 1",
          username: "sup1",
          phone: "081234567890",
          jobTitle: "Supervisor",
        },
      },
    });

    vi.spyOn(UserRepository, "findById").mockResolvedValue(mockSupervisorUser);

    await expect(
      AreaService.assignSupervisor(adminActor, "area-1", {
        supervisorId: "user-sup-1",
        effectiveStartDate: "2026-11-05",
      }),
    ).rejects.toMatchObject({
      code: "INVALID_ASSIGNMENT_DATE",
      statusCode: 400,
    });
  });

  it("[BR-03] Supervisor hanya mendapatkan daftar area yang ditugaskan kepadanya", async () => {
    vi.spyOn(ProjectRepository, "findById").mockResolvedValue(mockProject);
    const findManySpy = vi
      .spyOn(AreaRepository, "findManyByProjectId")
      .mockResolvedValue([
        {
          id: "area-1",
          projectId: "proj-1",
          code: "A",
          name: "Area 1 Milik Sup 1",
          createdAt: new Date(),
          updatedAt: new Date(),
          activeAssignment: null,
        },
      ]);

    const areas = await AreaService.getAreasByProject(supervisorActor, "proj-1");
    expect(areas.length).toBe(1);
    expect(findManySpy).toHaveBeenCalledWith("proj-1", supervisorActor.id);
  });

  it("[API Integration] Endpoint GET /projects/:projectId/areas dan /areas/:areaId/assignments", async () => {
    const adminToken = signAccessToken({
      sub: adminActor.id,
      role: adminActor.role,
      username: adminActor.username,
      name: adminActor.name,
      jobTitle: adminActor.jobTitle,
    });

    vi.spyOn(ProjectRepository, "findById").mockResolvedValue(mockProject);
    vi.spyOn(AreaRepository, "findManyByProjectId").mockResolvedValue([]);

    const areasRes = await invokeApp<ApiEnvelope<unknown[]>>(app, {
      method: "GET",
      path: "/api/v1/projects/proj-1/areas",
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });

    expect(areasRes.status).toBe(200);
    expect(areasRes.body.success).toBe(true);

    vi.spyOn(AreaRepository, "findById").mockResolvedValue({
      id: "area-1",
      projectId: "proj-1",
      code: "A",
      name: "Area Utama",
      createdAt: new Date(),
      updatedAt: new Date(),
      activeAssignment: null,
    });
    vi.spyOn(AreaRepository, "findAssignmentHistory").mockResolvedValue([]);

    const historyRes = await invokeApp<ApiEnvelope<unknown[]>>(app, {
      method: "GET",
      path: "/api/v1/areas/area-1/assignments",
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });

    expect(historyRes.status).toBe(200);
    expect(historyRes.body.success).toBe(true);
  });
});
