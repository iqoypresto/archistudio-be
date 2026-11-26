import { ProjectStatus, Role } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { ProjectRepository } from "../src/features/project/project.repository.js";
import { ProjectService } from "../src/features/project/project.service.js";
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

describe("TASK-04 Project Management — Unit & Integration Tests", () => {
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
    name: "Supervisor Lapangan",
    jobTitle: "Supervisor",
  };

  it("[AC-04.1 / BR-07, BR-11, BR-13] Owner/Admin berhasil membuat project baru dengan endDate null", async () => {
    vi.spyOn(ProjectRepository, "findByCode").mockResolvedValue(false);

    const createSpy = vi.spyOn(ProjectRepository, "create").mockResolvedValue({
      id: "proj-1",
      code: "VLA01",
      name: "Villa Ubud Bali",
      location: "Ubud, Bali",
      clientName: "PT Graha Indah",
      startDate: new Date("2026-11-01T00:00:00.000Z"),
      endDate: null,
      status: ProjectStatus.BERJALAN,
      timezone: "Asia/Makassar",
      routineHolidays: [0],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const project = await ProjectService.createProject(adminActor, {
      code: "vla01",
      name: "Villa Ubud Bali",
      location: "Ubud, Bali",
      clientName: "PT Graha Indah",
      startDate: "2026-11-01",
      endDate: null,
      status: ProjectStatus.BERJALAN,
      timezone: "Asia/Makassar",
      routineHolidays: [0],
    });

    expect(project.id).toBe("proj-1");
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "vla01",
        name: "Villa Ubud Bali",
        endDate: null,
        routineHolidays: [0],
      }),
    );
  });

  it("[BR-07 / INVALID_PROJECT_DATES] Menolak jika endDate lebih awal dari startDate (400)", async () => {
    await expect(
      ProjectService.createProject(adminActor, {
        code: "VLA02",
        name: "Villa Tabanan",
        location: "Tabanan",
        clientName: "Bpk. Wayan",
        startDate: "2026-11-10",
        endDate: "2026-11-05",
        status: ProjectStatus.PERSIAPAN,
        timezone: "Asia/Makassar",
        routineHolidays: [0],
      }),
    ).rejects.toMatchObject({
      code: "INVALID_PROJECT_DATES",
      statusCode: 400,
    });
  });

  it("[BR-13 / CONFLICT] Menolak jika kode project sudah digunakan (409)", async () => {
    vi.spyOn(ProjectRepository, "findByCode").mockResolvedValue(true);

    await expect(
      ProjectService.createProject(adminActor, {
        code: "VLA01",
        name: "Villa Duplikat",
        location: "Kuta",
        clientName: "Client A",
        startDate: "2026-11-01",
        status: ProjectStatus.PERSIAPAN,
        timezone: "Asia/Jakarta",
        routineHolidays: [0],
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      statusCode: 409,
    });
  });

  it("[BR-03] Supervisor ditolak mengakses detail project jika bukan area penugasannya (403)", async () => {
    vi.spyOn(ProjectRepository, "findById")
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "proj-restricted",
        code: "RST01",
        name: "Project Restricted",
        location: "Jakarta",
        clientName: "PT Rahasia",
        startDate: new Date(),
        endDate: null,
        status: ProjectStatus.BERJALAN,
        timezone: "Asia/Jakarta",
        routineHolidays: [0],
        createdAt: new Date(),
        updatedAt: new Date(),
        areas: [],
      });

    await expect(
      ProjectService.getProjectById(supervisorActor, "proj-restricted"),
    ).rejects.toMatchObject({
      code: "AREA_SCOPE_FORBIDDEN",
      statusCode: 403,
    });
  });

  it("[Update Project] Admin berhasil memperbarui project dan memvalidasi tanggal", async () => {
    vi.spyOn(ProjectRepository, "findById").mockResolvedValue({
      id: "proj-1",
      code: "VLA01",
      name: "Villa Ubud Bali",
      location: "Ubud, Bali",
      clientName: "PT Graha Indah",
      startDate: new Date("2026-11-01T00:00:00.000Z"),
      endDate: null,
      status: ProjectStatus.BERJALAN,
      timezone: "Asia/Makassar",
      routineHolidays: [0],
      createdAt: new Date(),
      updatedAt: new Date(),
      areas: [],
    });

    const updateSpy = vi.spyOn(ProjectRepository, "update").mockResolvedValue({
      id: "proj-1",
      code: "VLA01",
      name: "Villa Ubud Bali Updated",
      location: "Ubud, Bali",
      clientName: "PT Graha Indah",
      startDate: new Date("2026-11-01T00:00:00.000Z"),
      endDate: new Date("2027-01-31T00:00:00.000Z"),
      status: ProjectStatus.BERJALAN,
      timezone: "Asia/Makassar",
      routineHolidays: [0, 6],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const updated = await ProjectService.updateProject(adminActor, "proj-1", {
      name: "Villa Ubud Bali Updated",
      endDate: "2027-01-31",
      routineHolidays: [0, 6],
    });

    expect(updated.name).toBe("Villa Ubud Bali Updated");
    expect(updateSpy).toHaveBeenCalledWith("proj-1", expect.objectContaining({
      name: "Villa Ubud Bali Updated",
      routineHolidays: [0, 6],
    }));
  });

  it("[BR-39] Owner berhasil mengarsipkan project secara manual ke Archive", async () => {
    const ownerActor = { ...adminActor, id: "user-owner-1", role: Role.OWNER, username: "owner1" };
    vi.spyOn(ProjectRepository, "findById").mockResolvedValue({
      id: "proj-1",
      code: "VLA01",
      name: "Villa Ubud Bali",
      location: "Ubud, Bali",
      clientName: "PT Graha Indah",
      startDate: new Date("2026-11-01T00:00:00.000Z"),
      endDate: null,
      status: ProjectStatus.BERJALAN,
      timezone: "Asia/Makassar",
      routineHolidays: [0],
      completedAt: null,
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      areas: [],
    });

    const archivedAt = new Date("2026-11-19T12:00:00.000Z");
    const archiveSpy = vi.spyOn(ProjectRepository, "markArchived").mockResolvedValue({
      id: "proj-1",
      code: "VLA01",
      name: "Villa Ubud Bali",
      location: "Ubud, Bali",
      clientName: "PT Graha Indah",
      startDate: new Date("2026-11-01T00:00:00.000Z"),
      endDate: null,
      status: ProjectStatus.BERJALAN,
      timezone: "Asia/Makassar",
      routineHolidays: [0],
      completedAt: null,
      archivedAt,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await ProjectService.archiveProject(ownerActor, "proj-1", archivedAt);
    expect(result.id).toBe("proj-1");
    expect(result.archivedAt).toEqual(archivedAt);
    expect(archiveSpy).toHaveBeenCalledWith("proj-1", archivedAt);
  });

  it("[API Integration] Endpoint GET /api/v1/projects mengembalikan daftar berpaginasi", async () => {
    const adminToken = signAccessToken({
      sub: adminActor.id,
      role: adminActor.role,
      username: adminActor.username,
      name: adminActor.name,
      jobTitle: adminActor.jobTitle,
    });

    vi.spyOn(ProjectRepository, "findManyAndCount").mockResolvedValue([
      [
        {
          id: "proj-1",
          code: "VLA01",
          name: "Villa Ubud Bali",
          location: "Ubud, Bali",
          clientName: "PT Graha Indah",
          startDate: new Date("2026-11-01T00:00:00.000Z"),
          endDate: null,
          status: ProjectStatus.BERJALAN,
          timezone: "Asia/Makassar",
          routineHolidays: [0],
          createdAt: new Date(),
          updatedAt: new Date(),
          _count: { areas: 2 },
        },
      ],
      1,
    ]);

    vi.spyOn(ProjectRepository, "countActiveByStatus").mockResolvedValue({
      all: 3,
      BERJALAN: 2,
      PERSIAPAN: 1,
    });

    const res = await invokeApp<ApiEnvelope<unknown[]> & { statusCounts?: { all: number; BERJALAN: number; PERSIAPAN: number } }>(app, {
      method: "GET",
      path: "/api/v1/projects?page=1&pageSize=10",
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.statusCounts).toEqual({ all: 3, BERJALAN: 2, PERSIAPAN: 1 });
  });
});
