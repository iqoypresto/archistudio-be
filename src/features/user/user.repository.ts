import { Prisma, type Role } from "@prisma/client";
import { prisma } from "../../configs/prisma-client.config.js";
import type { UserListItem } from "./user.type.js";

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
});

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

    return Promise.all([
      prisma.user.findMany({
        where,
        select: userSelect,
        skip: params.skip,
        take: params.take,
        orderBy,
      }),
      prisma.user.count({ where }),
    ]);
  }

  /** Mencari user aktif/nonaktif (belum di-soft delete) berdasarkan ID. */
  static async findById(id: string): Promise<UserListItem | null> {
    return prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: userSelect,
    });
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
    return prisma.user.create({
      data: {
        ...data,
        isActive: true,
      },
      select: userSelect,
    });
  }

  /** Memperbarui data pengguna. */
  static async update(
    id: string,
    data: Prisma.UserUpdateInput,
  ): Promise<UserListItem> {
    return prisma.user.update({
      where: { id },
      data,
      select: userSelect,
    });
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

      return updatedUser;
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

      return updatedUser;
    });
  }
}
