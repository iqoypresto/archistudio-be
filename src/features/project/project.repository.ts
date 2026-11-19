import { Prisma, ProjectStatus } from "@prisma/client";
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
  completedAt: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
  _count: {
    select: {
      areas: { where: { deletedAt: null } },
    },
  },
});

function buildSearchFilter(search?: string): Prisma.ProjectWhereInput {
  if (!search) return {};
  return {
    OR: [
      { name: { contains: search, mode: "insensitive" } },
      { code: { contains: search, mode: "insensitive" } },
      { location: { contains: search, mode: "insensitive" } },
      { clientName: { contains: search, mode: "insensitive" } },
    ],
  };
}

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
  /** Mengambil daftar project aktif (non-arsip & non-selesai) berpaginasi (US-04, BR-03, BR-39). */
  static async findManyAndCount(params: FindProjectsParams): Promise<[ProjectListItem[], number]> {
    const where: Prisma.ProjectWhereInput = {
      deletedAt: null,
      archivedAt: null,
      status: params.status ?? { not: ProjectStatus.SELESAI },
      ...(params.supervisorUserId && {
        areas: {
          some: {
            deletedAt: null,
            assignments: { some: { supervisorId: params.supervisorUserId, endDate: null } },
          },
        },
      }),
      ...buildSearchFilter(params.search),
    };

    const orderBy: Prisma.ProjectOrderByWithRelationInput = {
      [params.sortBy ?? "createdAt"]: params.sortOrder ?? "desc",
    };

    return Promise.all([
      prisma.project.findMany({ where, select: projectSelect, skip: params.skip, take: params.take, orderBy }),
      prisma.project.count({ where }),
    ]);
  }

  /** Mengambil daftar project di Archive (status SELESAI atau arsip manual) (US-22, BR-39). */
  static async findArchived(search?: string): Promise<ProjectListItem[]> {
    return prisma.project.findMany({
      where: {
        deletedAt: null,
        AND: [
          { OR: [{ status: ProjectStatus.SELESAI }, { archivedAt: { not: null } }] },
          buildSearchFilter(search),
        ],
      },
      select: projectSelect,
      orderBy: [{ completedAt: "desc" }, { archivedAt: "desc" }, { updatedAt: "desc" }],
    });
  }

  /** Mengambil detail project beserta ringkasan area; SUPERVISOR dibatasi pada project aktif (BR-03, BR-39). */
  static async findById(id: string, supervisorUserId?: string): Promise<ProjectDetail | null> {
    return prisma.project.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(supervisorUserId && {
          archivedAt: null,
          status: { not: ProjectStatus.SELESAI },
          areas: {
            some: {
              deletedAt: null,
              assignments: { some: { supervisorId: supervisorUserId, endDate: null } },
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
              assignments: { some: { supervisorId: supervisorUserId, endDate: null } },
            }),
          },
          select: { id: true, code: true, name: true },
          orderBy: { code: "asc" },
        },
      },
    });
  }

  /** Mencari project aktif berdasarkan kode unik (BR-13). */
  static async findByCode(code: string, excludeId?: string): Promise<boolean> {
    const count = await prisma.project.count({
      where: { code, deletedAt: null, ...(excludeId && { id: { not: excludeId } }) },
    });
    return count > 0;
  }

  /** Menyimpan master data project baru (US-04, BR-07, BR-11, BR-13). */
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
      data: { ...data, endDate: data.endDate ?? null },
      select: projectSelect,
    });
  }

  /** Memperbarui master data project (US-04, BR-07, BR-11). */
  static async update(id: string, data: Prisma.ProjectUpdateInput): Promise<ProjectListItem> {
    return prisma.project.update({ where: { id }, data, select: projectSelect });
  }

  /** Menandai project SELESAI dan otomatis masuk Archive berdasarkan completedAt (US-22, BR-12, BR-39). */
  static async markCompleted(id: string, completedAt: Date): Promise<ProjectListItem> {
    return prisma.project.update({
      where: { id },
      data: { status: ProjectStatus.SELESAI, completedAt, archivedAt: null },
      select: projectSelect,
    });
  }

  /** Mengarsipkan project secara manual tanpa menghapus permanen (US-22, BR-39). */
  static async markArchived(id: string, archivedAt: Date): Promise<ProjectListItem> {
    return prisma.project.update({
      where: { id },
      data: { archivedAt },
      select: projectSelect,
    });
  }

  /** Memulihkan project dari Archive ke status PERSIAPAN atau BERJALAN (US-22, BR-39). */
  static async restoreProject(id: string, status: ProjectStatus): Promise<ProjectListItem> {
    return prisma.project.update({
      where: { id },
      data: { status, completedAt: null, archivedAt: null },
      select: projectSelect,
    });
  }
}
