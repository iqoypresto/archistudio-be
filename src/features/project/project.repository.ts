import { Prisma, type ProjectStatus } from "@prisma/client";
import { prisma } from "../../configs/prisma-client.config.js";
import type { ProjectDetail, ProjectListItem } from "./project.type.js";

const projectSelect = Prisma.validator<Prisma.ProjectSelect>()({
  id: true,
  code: true,
  name: true,
  location: true,
  clientName: true,
  startDate: true,
  endDate: true,
  status: true,
  timezone: true,
  routineHolidays: true,
  createdAt: true,
  updatedAt: true,
  _count: {
    select: {
      areas: { where: { deletedAt: null } },
    },
  },
});

export interface FindProjectsParams {
  skip: number;
  take: number;
  search?: string;
  status?: ProjectStatus;
  sortBy?: "name" | "code" | "startDate" | "createdAt";
  sortOrder?: "asc" | "desc";
  supervisorUserId?: string;
}

export class ProjectRepository {
  /** Mengambil daftar project dengan paginasi dan filter pencarian/status/supervisor (BR-03, US-04). */
  static async findManyAndCount(params: FindProjectsParams): Promise<[ProjectListItem[], number]> {
    const where: Prisma.ProjectWhereInput = {
      deletedAt: null,
      ...(params.status && { status: params.status }),
      ...(params.supervisorUserId && {
        areas: {
          some: {
            deletedAt: null,
            assignments: {
              some: {
                supervisorId: params.supervisorUserId,
                endDate: null,
              },
            },
          },
        },
      }),
      ...(params.search && {
        OR: [
          { name: { contains: params.search, mode: "insensitive" } },
          { code: { contains: params.search, mode: "insensitive" } },
          { location: { contains: params.search, mode: "insensitive" } },
          { clientName: { contains: params.search, mode: "insensitive" } },
        ],
      }),
    };

    const orderBy: Prisma.ProjectOrderByWithRelationInput = {
      [params.sortBy ?? "createdAt"]: params.sortOrder ?? "desc",
    };

    return Promise.all([
      prisma.project.findMany({
        where,
        select: projectSelect,
        skip: params.skip,
        take: params.take,
        orderBy,
      }),
      prisma.project.count({ where }),
    ]);
  }

  /** Mengambil detail project beserta daftar ringkas area (BR-03, US-04). */
  static async findById(id: string, supervisorUserId?: string): Promise<ProjectDetail | null> {
    const project = await prisma.project.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(supervisorUserId && {
          areas: {
            some: {
              deletedAt: null,
              assignments: {
                some: {
                  supervisorId: supervisorUserId,
                  endDate: null,
                },
              },
            },
          },
        }),
      },
      select: {
        ...projectSelect,
        areas: {
          where: {
            deletedAt: null,
            ...(supervisorUserId && {
              assignments: {
                some: {
                  supervisorId: supervisorUserId,
                  endDate: null,
                },
              },
            }),
          },
          select: { id: true, code: true, name: true },
          orderBy: { code: "asc" },
        },
      },
    });

    return project;
  }

  /** Mencari project aktif berdasarkan kode unik (BR-13). */
  static async findByCode(code: string, excludeId?: string): Promise<boolean> {
    const count = await prisma.project.count({
      where: {
        code,
        deletedAt: null,
        ...(excludeId && { id: { not: excludeId } }),
      },
    });
    return count > 0;
  }

  /** Menyimpan master data project baru ke database (US-04, BR-07, BR-11, BR-13). */
  static async create(data: {
    code: string;
    name: string;
    location: string;
    clientName: string;
    startDate: Date;
    endDate?: Date | null;
    status: ProjectStatus;
    timezone: string;
    routineHolidays: number[];
  }): Promise<ProjectListItem> {
    return prisma.project.create({
      data: {
        code: data.code,
        name: data.name,
        location: data.location,
        clientName: data.clientName,
        startDate: data.startDate,
        endDate: data.endDate ?? null,
        status: data.status,
        timezone: data.timezone,
        routineHolidays: data.routineHolidays,
      },
      select: projectSelect,
    });
  }

  /** Memperbarui master data project (US-04, BR-07, BR-11). */
  static async update(
    id: string,
    data: Prisma.ProjectUpdateInput,
  ): Promise<ProjectListItem> {
    return prisma.project.update({
      where: { id },
      data,
      select: projectSelect,
    });
  }

  /** Pengarsipan soft-delete data project (BR-05, NFR-05). */
  static async archive(id: string): Promise<{ id: string; deletedAt: Date }> {
    const deletedAt = new Date();
    await prisma.project.update({
      where: { id },
      data: { deletedAt },
    });
    return { id, deletedAt };
  }
}
