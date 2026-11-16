import { Role } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { UserRepository } from "../src/features/user/user.repository.js";
import { UserService } from "../src/features/user/user.service.js";
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

describe("TASK-03 User Management — Unit & Integration Tests", () => {
  const adminActor = {
    id: "user-admin-1",
    role: Role.ADMIN,
    username: "admin1",
    name: "Admin Proyek",
    jobTitle: "Admin",
  };

  const ownerActor = {
    id: "user-owner-1",
    role: Role.OWNER,
    username: "owner1",
    name: "Pak Owner",
    jobTitle: "Direktur",
  };

  it("[AC-02.1 / BR-01, BR-02] Admin dilarang membuat akun dengan peran selain SUPERVISOR", async () => {
    await expect(
      UserService.createUser(adminActor, {
        name: "Admin Baru",
        username: "admin2",
        phone: "081299990001",
        password: "password123",
        role: "ADMIN",
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      statusCode: 403,
    });
  });

  it("[AC-03.1 / BR-04, BR-06] Owner dan Admin berhasil membuat akun SUPERVISOR baru", async () => {
    vi.spyOn(UserRepository, "findConflict").mockResolvedValue({
      usernameExists: false,
      phoneExists: false,
    });

    const createSpy = vi.spyOn(UserRepository, "create").mockResolvedValue({
      id: "new-sup-id",
      name: "Budi Santoso",
      username: "budis",
      phone: "081234567890",
      role: Role.SUPERVISOR,
      jobTitle: "Supervisor Lapangan",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const created = await UserService.createUser(adminActor, {
      name: "Budi Santoso",
      username: "budis",
      phone: "081234567890",
      password: "password123",
      role: "SUPERVISOR",
      jobTitle: "Supervisor Lapangan",
    });

    expect(created.id).toBe("new-sup-id");
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Budi Santoso",
        username: "budis",
        role: Role.SUPERVISOR,
      }),
    );
  });

  it("[Conflict Check] Menolak pembuatan akun jika username atau nomor HP sudah terdaftar (409)", async () => {
    vi.spyOn(UserRepository, "findConflict").mockResolvedValue({
      usernameExists: true,
      phoneExists: false,
    });

    await expect(
      UserService.createUser(ownerActor, {
        name: "Duplikat User",
        username: "existinguser",
        phone: "081234567899",
        password: "password123",
        role: "SUPERVISOR",
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      statusCode: 409,
    });
  });

  it("[BR-01, BR-02] Admin dilarang mengubah, mereset sandi, atau menonaktifkan akun Owner/Admin", async () => {
    vi.spyOn(UserRepository, "findById").mockResolvedValue({
      id: "target-owner-id",
      name: "Owner Target",
      username: "ownertarget",
      phone: "081200000000",
      role: Role.OWNER,
      jobTitle: "Owner",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(
      UserService.updateUser(adminActor, "target-owner-id", { name: "Ubah Nama" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", statusCode: 403 });

    await expect(
      UserService.resetPassword(adminActor, "target-owner-id", {
        newPassword: "newsecret123",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", statusCode: 403 });

    await expect(
      UserService.toggleStatus(adminActor, "target-owner-id", { isActive: false }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", statusCode: 403 });
  });

  it("[AC-01.2 / BR-05] Menonaktifkan akun mengubah status & melarang penonaktifan akun sendiri", async () => {
    await expect(
      UserService.toggleStatus(ownerActor, ownerActor.id, { isActive: false }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", statusCode: 403 });

    vi.spyOn(UserRepository, "findById").mockResolvedValue({
      id: "target-sup-id",
      name: "Supervisor Nonaktif",
      username: "supnonaktif",
      phone: "081211112222",
      role: Role.SUPERVISOR,
      jobTitle: "Supervisor",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const setStatusSpy = vi
      .spyOn(UserRepository, "setStatusAndRevokeTokens")
      .mockResolvedValue({
        id: "target-sup-id",
        name: "Supervisor Nonaktif",
        username: "supnonaktif",
        phone: "081211112222",
        role: Role.SUPERVISOR,
        jobTitle: "Supervisor",
        isActive: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

    const result = await UserService.toggleStatus(ownerActor, "target-sup-id", {
      isActive: false,
    });

    expect(result.isActive).toBe(false);
    expect(setStatusSpy).toHaveBeenCalledWith("target-sup-id", false);
  });

  it("[API Integration] Endpoint GET /api/v1/users mengembalikan daftar berpaginasi terotentikasi", async () => {
    const ownerToken = signAccessToken({
      sub: ownerActor.id,
      role: ownerActor.role,
      username: ownerActor.username,
      name: ownerActor.name,
      jobTitle: ownerActor.jobTitle,
    });

    vi.spyOn(UserRepository, "findManyAndCount").mockResolvedValue([
      [
        {
          id: "sup-1",
          name: "Supervisor A",
          username: "supa",
          phone: "081233334444",
          role: Role.SUPERVISOR,
          jobTitle: "Supervisor",
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      1,
    ]);

    const res = await invokeApp<ApiEnvelope<unknown[]>>(app, {
      method: "GET",
      path: "/api/v1/users?page=1&pageSize=10",
      headers: {
        Authorization: `Bearer ${ownerToken}`,
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
