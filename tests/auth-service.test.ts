import { Role } from "@prisma/client";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { AuthRepository } from "../src/features/auth/auth.repository.js";
import { hashPassword, hashTokenSha256 } from "../src/utils/auth/bcrypt.util.js";
import { signRefreshToken } from "../src/utils/auth/jwt.util.js";
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

describe("Auth API — Login, Refresh, Logout & BR-04/BR-05", () => {
  let validHash = "";

  beforeAll(async () => {
    validHash = await hashPassword("rahasia123");
  });

  function buildUser(overrides?: { isActive?: boolean; deletedAt?: Date | null }) {
    return {
      id: "user-sup-1",
      name: "Ahmad Fauzi",
      username: "supervisor1",
      phone: "081100000003",
      passwordHash: validHash,
      role: Role.SUPERVISOR,
      jobTitle: "Supervisor Lapangan",
      isActive: overrides?.isActive ?? true,
      deletedAt: overrides?.deletedAt ?? null,
    };
  }

  async function mockAndLogin(user: ReturnType<typeof buildUser>) {
    vi.spyOn(AuthRepository, "findUserByIdentifier").mockResolvedValue(user);
    vi.spyOn(AuthRepository, "createRefreshToken").mockResolvedValue({
      id: "rt-token",
      userId: user.id,
      tokenHash: "hash",
      expiresAt: new Date(Date.now() + 86_400_000),
      revokedAt: null,
      createdAt: new Date(),
    });
    const res = await invokeApp<ApiEnvelope<{ accessToken: string; refreshToken: string }>>(app, {
      method: "POST",
      path: "/api/v1/auth/login",
      body: { identifier: "supervisor1", password: "rahasia123" },
    });
    return {
      accessToken: res.body.data?.accessToken ?? "",
      refreshToken: res.body.data?.refreshToken ?? "",
    };
  }

  it("berhasil login via username/no HP dan menyimpan hash refresh token (AC-01.1, BR-04)", async () => {
    vi.spyOn(AuthRepository, "findUserByIdentifier").mockResolvedValue(buildUser());
    const createSpy = vi.spyOn(AuthRepository, "createRefreshToken").mockResolvedValue({
      id: "rt-1",
      userId: "user-sup-1",
      tokenHash: "hashed",
      expiresAt: new Date(Date.now() + 86_400_000),
      revokedAt: null,
      createdAt: new Date(),
    });
    const res = await invokeApp<ApiEnvelope<{ refreshToken: string }>>(app, {
      method: "POST",
      path: "/api/v1/auth/login",
      body: { identifier: "081100000003", password: "rahasia123" },
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-sup-1",
        tokenHash: hashTokenSha256(res.body.data?.refreshToken ?? ""),
      }),
    );
  });

  it("menolak password salah dengan 401 INVALID_CREDENTIALS", async () => {
    vi.spyOn(AuthRepository, "findUserByIdentifier").mockResolvedValue(buildUser());
    const res = await invokeApp<ApiEnvelope>(app, {
      method: "POST",
      path: "/api/v1/auth/login",
      body: { identifier: "supervisor1", password: "salah-password" },
    });
    expect(res.status).toBe(401);
    expect(res.body.error?.code).toBe("INVALID_CREDENTIALS");
  });

  it("menolak login dan refresh untuk akun nonaktif (AC-01.2, BR-05)", async () => {
    const inactiveUser = buildUser({ isActive: false });
    vi.spyOn(AuthRepository, "findUserByIdentifier").mockResolvedValue(inactiveUser);
    const loginRes = await invokeApp<ApiEnvelope>(app, {
      method: "POST",
      path: "/api/v1/auth/login",
      body: { identifier: "supervisor1", password: "rahasia123" },
    });
    expect(loginRes.status).toBe(403);
    expect(loginRes.body.error?.code).toBe("ACCOUNT_INACTIVE");

    const token = signRefreshToken(inactiveUser.id);
    vi.spyOn(AuthRepository, "findRefreshTokenByHash").mockResolvedValue({
      id: "rt-2",
      userId: inactiveUser.id,
      tokenHash: hashTokenSha256(token),
      expiresAt: new Date(Date.now() + 86_400_000),
      revokedAt: null,
      createdAt: new Date(),
      user: inactiveUser,
    });
    const refreshRes = await invokeApp<ApiEnvelope>(app, {
      method: "POST",
      path: "/api/v1/auth/refresh",
      body: { refreshToken: token },
    });
    expect(refreshRes.status).toBe(403);
    expect(refreshRes.body.error?.code).toBe("ACCOUNT_INACTIVE");
  });

  it("merotasi refresh token secara valid", async () => {
    const user = buildUser();
    const { refreshToken } = await mockAndLogin(user);
    vi.spyOn(AuthRepository, "findRefreshTokenByHash").mockResolvedValue({
      id: "rt-3",
      userId: user.id,
      tokenHash: hashTokenSha256(refreshToken),
      expiresAt: new Date(Date.now() + 86_400_000),
      revokedAt: null,
      createdAt: new Date(),
      user,
    });
    vi.spyOn(AuthRepository, "rotateRefreshToken").mockResolvedValue(true);

    const res = await invokeApp<ApiEnvelope<{ refreshToken: string }>>(app, {
      method: "POST",
      path: "/api/v1/auth/refresh",
      body: { refreshToken },
    });
    expect(res.status).toBe(200);
    expect(res.body.data?.refreshToken).not.toBe(refreshToken);
  });

  it("memproteksi endpoint /me dan mencabut sesi saat logout", async () => {
    const user = buildUser();
    const { accessToken, refreshToken } = await mockAndLogin(user);
    vi.spyOn(AuthRepository, "findUserById").mockResolvedValue(user);
    const revokeSpy = vi.spyOn(AuthRepository, "revokeRefreshToken").mockResolvedValue({ count: 1 });

    const meRes = await invokeApp<ApiEnvelope<{ username: string }>>(app, {
      method: "GET",
      path: "/api/v1/auth/me",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(meRes.status).toBe(200);
    expect(meRes.body.data?.username).toBe("supervisor1");
    expect((await invokeApp(app, { method: "GET", path: "/api/v1/auth/me" })).status).toBe(401);

    const logoutRes = await invokeApp<ApiEnvelope<{ loggedOut: boolean }>>(app, {
      method: "POST",
      path: "/api/v1/auth/logout",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: { refreshToken },
    });
    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body.data).toEqual({ loggedOut: true });
    expect(revokeSpy).toHaveBeenCalledWith(hashTokenSha256(refreshToken), user.id, expect.any(Date));
  });
});
