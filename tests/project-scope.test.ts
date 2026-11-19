import { beforeEach, describe, expect, it, vi } from "vitest";
import { Role } from "@prisma/client";
import type { AuthenticatedUser } from "../src/types/express.d.js";
import { ProjectRepository } from "../src/features/project/project.repository.js";
import { ProjectService } from "../src/features/project/project.service.js";

const prismaMock = vi.hoisted(() => ({
  project: {
    findMany: vi.fn(),
    count: vi.fn(),
  },
}));

vi.mock("../src/configs/prisma-client.config.js", () => ({ prisma: prismaMock }));

const supervisor: AuthenticatedUser = {
  id: "supervisor-1",
  role: Role.SUPERVISOR,
  username: "sari",
  name: "Sari",
  jobTitle: "Supervisor",
};

const admin: AuthenticatedUser = {
  id: "admin-1",
  role: Role.ADMIN,
  username: "admin",
  name: "Admin",
  jobTitle: "Admin",
};

describe("TASK-10 AC-23.1 / BR-40 project visibility scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.project.findMany.mockResolvedValue([]);
    prismaMock.project.count.mockResolvedValue(0);
  });

  it("passes the supervisor identity to the project list scope", async () => {
    const findManyAndCount = vi.spyOn(ProjectRepository, "findManyAndCount");

    await ProjectService.getProjects(supervisor, {
      page: 1,
      pageSize: 20,
      sortBy: "createdAt",
      sortOrder: "desc",
    });

    expect(findManyAndCount).toHaveBeenCalledWith(expect.objectContaining({
      skip: 0,
      take: 20,
      supervisorUserId: "supervisor-1",
    }));
  });

  it("does not restrict the project list to a supervisor for Admin", async () => {
    const findManyAndCount = vi.spyOn(ProjectRepository, "findManyAndCount");

    await ProjectService.getProjects(admin, {
      page: 1,
      pageSize: 20,
      sortBy: "createdAt",
      sortOrder: "desc",
    });

    expect(findManyAndCount).toHaveBeenCalledWith(expect.objectContaining({
      skip: 0,
      take: 20,
      supervisorUserId: undefined,
    }));
  });

  it("filters both project results and pagination count to non-deleted areas with an open assignment", async () => {
    await ProjectRepository.findManyAndCount({
      skip: 0,
      take: 20,
      supervisorUserId: "supervisor-1",
    });

    const expectedProjectScope = {
      deletedAt: null,
      areas: {
        some: {
          deletedAt: null,
          assignments: {
            some: {
              supervisorId: "supervisor-1",
              endDate: null,
            },
          },
        },
      },
    };

    expect(prismaMock.project.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expectedProjectScope,
    }));
    expect(prismaMock.project.count).toHaveBeenCalledWith({ where: expectedProjectScope });
  });
});
