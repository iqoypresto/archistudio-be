import { Prisma, ProjectStatus, type Role } from "@prisma/client";
import { prisma } from "../../configs/prisma-client.config.js";
import type { UserListItem, UserSummaryCount } from "./user.type.js";

const userSelect = Prisma.validator<Prisma.UserSelect>()({
  id: true,
  name: true,
  username: true,
  phone: true,
  role: true,
  jobTitle: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  _count: {
    select: {
      supervisorAssigns: {
        where: {
          endDate: null,
          area: {
            deletedAt: null,
            project: {
              deletedAt: null,
              archivedAt: null,
              status: { not: ProjectStatus.SELESAI },
            },
          },
        },
      },
      managedProjects: {
        where: {
          deletedAt: null,
          archivedAt: null,
          status: { not: ProjectStatus.SELESAI },
        },
      },
    },
  },
});

type RawUserRow = Prisma.UserGetPayload<{ select: typeof userSelect }>;

function mapUserRow(row: RawUserRow): UserListItem {
  const { _count, ...rest } = row;
  return {
    ...rest,
    activeAreaCount: _count.supervisorAssigns,
    managedProjectCount: _count.managedProjects,
  };
}

export interface FindUsersParams {
  skip: number;
  take: number;
  search?: string;
  role?: Role;
  isActive?: boolean;
  sortBy?: "name" | "username" | "createdAt";
  sortOrder?: "asc" | "desc";
}

export class UserRepository {
  /** Mengambil daftar pengguna beserta total baris untuk paginasi. */
  static async findManyAndCount(params: FindUsersParams): Promise<[UserListItem[], number]> {
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(params.role && { role: params.role }),
      ...(params.isActive !== undefined && { isActive: params.isActive }),
      ...(params.search && {
        OR: [
          { name: { contains: params.search, mode: "insensitive" } },
          { username: { contains: params.search, mode: "insensitive" } },
          { phone: { contains: params.search } },
        ],
      }),
    };

    const orderBy: Prisma.UserOrderByWithRelationInput = {
      [params.sortBy ?? "createdAt"]: params.sortOrder ?? "desc",
    };

    const [rows, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: userSelect,
        skip: params.skip,
        take: params.take,
        orderBy,
      }),
      prisma.user.count({ where }),
    ]);
    return [rows.map(mapUserRow), total];
  }

  /** Mengambil ringkasan global jumlah anggota per status aktif dan peran. */
  static async getGlobalSummary(): Promise<UserSummaryCount> {
    const groups = await prisma.user.groupBy({
      by: ["role", "isActive"],
      where: { deletedAt: null },
      _count: { _all: true },
    });

    let total = 0;
    let active = 0;
    let inactive = 0;
    const byRole: Record<Role, number> = {
      OWNER: 0,
      ADMIN: 0,
      SITE_MANAGER: 0,
      SUPERVISOR: 0,
    };

    for (const row of groups) {
      const count = row._count._all;
      total += count;
      byRole[row.role] += count;
      if (row.isActive) active += count;
      else inactive += count;
    }

    return { total, active, inactive, byRole };
  }

  /** Mencari user aktif/nonaktif (belum di-soft delete) berdasarkan ID. */
  static async findById(id: string): Promise<UserListItem | null> {
    const row = await prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: userSelect,
    });
    return row ? mapUserRow(row) : null;
  }

  /** Memeriksa duplikasi username atau nomor HP pada akun lain. */
  static async findConflict(
    username?: string,
    phone?: string,
    excludeUserId?: string,
  ): Promise<{ usernameExists: boolean; phoneExists: boolean }> {
    const conditions: Prisma.UserWhereInput[] = [];
    if (username) conditions.push({ username });
    if (phone) conditions.push({ phone });

    if (conditions.length === 0) {
      return { usernameExists: false, phoneExists: false };
    }

    const matches = await prisma.user.findMany({
      where: {
        deletedAt: null,
        ...(excludeUserId && { id: { not: excludeUserId } }),
        OR: conditions,
      },
      select: { username: true, phone: true },
    });

    return {
      usernameExists: matches.some((u) => u.username === username),
      phoneExists: matches.some((u) => u.phone === phone),
    };
  }

  /** Menyimpan akun baru ke dalam database. */
  static async create(data: {
    name: string;
    username: string;
    phone: string;
    passwordHash: string;
    role: Role;
    jobTitle: string;
  }): Promise<UserListItem> {
    const created = await prisma.user.create({
      data: { ...data, isActive: true },
      select: userSelect,
    });
    return mapUserRow(created);
  }

  /** Memperbarui data pengguna. */
  static async update(id: string, data: Prisma.UserUpdateInput): Promise<UserListItem> {
    const updated = await prisma.user.update({ where: { id }, data, select: userSelect });
    return mapUserRow(updated);
  }

  /** Me-reset kata sandi dan mencabut seluruh sesi token user terkait secara atomik. */
  static async resetPasswordAndRevokeTokens(
    userId: string,
    passwordHash: string,
  ): Promise<UserListItem> {
    return prisma.$transaction(async (tx) => {
      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: { passwordHash },
        select: userSelect,
      });

      await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      return mapUserRow(updatedUser);
    });
  }

  /** Memperbarui status aktif/nonaktif dan mencabut token bila dinonaktifkan secara atomik. */
  static async setStatusAndRevokeTokens(
    userId: string,
    isActive: boolean,
  ): Promise<UserListItem> {
    return prisma.$transaction(async (tx) => {
      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: { isActive },
        select: userSelect,
      });

      if (!isActive) {
        await tx.refreshToken.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }

      return mapUserRow(updatedUser);
    });
  }
}
