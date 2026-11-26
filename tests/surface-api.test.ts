import { Role } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { ProjectRepository } from "../src/features/project/project.repository.js";
import type { AuthenticatedUser } from "../src/types/express.d.js";
import { signAccessToken } from "../src/utils/auth/jwt.util.js";
import { invokeApp } from "./helpers/invoke-app.helper.js";

vi.mock("../src/configs/prisma-client.config.js", () => ({ prisma: {} }));

interface ApiEnvelope<T = unknown> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

function tokenFor(role: Role, id: string): string {
  return signAccessToken({
    sub: id,
    role,
    username: id,
    name: id,
    jobTitle: role,
  });
}

function authorization(actor: AuthenticatedUser): Record<string, string> {
  return { Authorization: `Bearer ${tokenFor(actor.role, actor.id)}` };
}

describe("TASK-22 API surfaces (AC-23.1, BR-03, BR-40)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("requires authentication on both canonical namespaces", async () => {
    for (const path of ["/api/v1/office/projects", "/api/v1/field/projects"]) {
      const response = await invokeApp<ApiEnvelope>(app, { method: "GET", path });
      expect(response.status).toBe(401);
      expect(response.body.error?.code).toBe("AUTHENTICATION_REQUIRED");
    }
  });

  it("rejects cross-surface roles and keeps Owner-only Office actions restricted", async () => {
    const supervisor: AuthenticatedUser = {
      id: "sup-1", role: Role.SUPERVISOR, username: "sup-1", name: "Supervisor", jobTitle: "Supervisor",
    };
    const owner: AuthenticatedUser = {
      id: "owner-1", role: Role.OWNER, username: "owner-1", name: "Owner", jobTitle: "Owner",
    };
    const admin: AuthenticatedUser = {
      id: "admin-1", role: Role.ADMIN, username: "admin-1", name: "Admin", jobTitle: "Admin",
    };
    const cases = [
      { path: "/api/v1/office/projects", actor: supervisor },
      { path: "/api/v1/field/projects", actor: owner },
      { path: "/api/v1/office/payments/people", actor: admin },
    ];

    for (const testCase of cases) {
      const response = await invokeApp<ApiEnvelope>(app, {
        method: "GET", path: testCase.path, headers: authorization(testCase.actor),
      });
      expect(response.status).toBe(403);
      expect(response.body.error?.code).toBe("FORBIDDEN");
    }
  });

  it("scopes canonical and compatibility Field project lists to active Supervisor assignments (BR-03, BR-40)", async () => {
    const supervisor: AuthenticatedUser = {
      id: "sup-1", role: Role.SUPERVISOR, username: "sup-1", name: "Supervisor", jobTitle: "Supervisor",
    };
    const repositorySpy = vi.spyOn(ProjectRepository, "findManyAndCount").mockResolvedValue([[], 0]);
    vi.spyOn(ProjectRepository, "countActiveByStatus").mockResolvedValue({
      all: 0,
      BERJALAN: 0,
      PERSIAPAN: 0,
    });

    const canonicalResponse = await invokeApp<ApiEnvelope<unknown[]>>(app, {
      method: "GET", path: "/api/v1/field/projects?page=1&pageSize=10", headers: authorization(supervisor),
    });
    const compatibilityResponse = await invokeApp<ApiEnvelope<unknown[]>>(app, {
      method: "GET", path: "/api/v1/projects?page=1&pageSize=10", headers: authorization(supervisor),
    });

    expect(canonicalResponse.status).toBe(200);
    expect(compatibilityResponse.status).toBe(200);
    expect(canonicalResponse.body.success).toBe(true);
    expect(canonicalResponse.body.data).toEqual([]);
    expect(repositorySpy).toHaveBeenCalledTimes(2);
    for (const [params] of repositorySpy.mock.calls) expect(params).toMatchObject({
      supervisorUserId: supervisor.id,
      siteManagerUserId: undefined,
    });
  });

  it("retains Site Manager Field scope without treating it as Supervisor scope", async () => {
    const siteManager: AuthenticatedUser = {
      id: "sm-1", role: Role.SITE_MANAGER, username: "sm-1", name: "Site Manager", jobTitle: "Site Manager",
    };
    const repositorySpy = vi.spyOn(ProjectRepository, "findManyAndCount").mockResolvedValue([[], 0]);
    vi.spyOn(ProjectRepository, "countActiveByStatus").mockResolvedValue({
      all: 0,
      BERJALAN: 0,
      PERSIAPAN: 0,
    });

    const response = await invokeApp<ApiEnvelope<unknown[]>>(app, {
      method: "GET", path: "/api/v1/field/projects?page=1&pageSize=10", headers: authorization(siteManager),
    });

    expect(response.status).toBe(200);
    expect(repositorySpy).toHaveBeenCalledWith(expect.objectContaining({
      supervisorUserId: undefined,
      siteManagerUserId: siteManager.id,
    }));
  });

  it("keeps Office project reads on the Office namespace without Field assignment filters", async () => {
    const owner: AuthenticatedUser = {
      id: "owner-1", role: Role.OWNER, username: "owner-1", name: "Owner", jobTitle: "Owner",
    };
    const repositorySpy = vi.spyOn(ProjectRepository, "findManyAndCount").mockResolvedValue([[], 0]);
    vi.spyOn(ProjectRepository, "countActiveByStatus").mockResolvedValue({
      all: 0,
      BERJALAN: 0,
      PERSIAPAN: 0,
    });

    const response = await invokeApp<ApiEnvelope<unknown[]>>(app, {
      method: "GET", path: "/api/v1/office/projects?page=1&pageSize=10", headers: authorization(owner),
    });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(repositorySpy).toHaveBeenCalledWith(expect.objectContaining({
      supervisorUserId: undefined,
      siteManagerUserId: undefined,
    }));
  });
});
