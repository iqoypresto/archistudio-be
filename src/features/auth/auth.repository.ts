import { Prisma } from "@prisma/client";
import { prisma } from "../../configs/prisma-client.config.js";

const userAuthSelect = Prisma.validator<Prisma.UserSelect>()({
  id: true,
  name: true,
  username: true,
  phone: true,
  passwordHash: true,
  role: true,
  jobTitle: true,
  isActive: true,
  deletedAt: true,
});

const refreshTokenWithUserInclude = Prisma.validator<Prisma.RefreshTokenInclude>()({
  user: { select: userAuthSelect },
});

export class AuthRepository {
  /** Mencari user aktif/nonaktif (belum di-soft-delete) berdasarkan username atau nomor HP. */
  static async findUserByIdentifier(identifier: string) {
    return prisma.user.findFirst({
      where: {
        deletedAt: null,
        OR: [{ username: identifier }, { phone: identifier }],
      },
      select: userAuthSelect,
    });
  }

  /** Mengambil profil user berdasarkan ID. */
  static async findUserById(userId: string) {
    return prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: userAuthSelect,
    });
  }

  /** Menyimpan hash refresh token baru untuk user. */
  static async createRefreshToken(data: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }) {
    return prisma.refreshToken.create({ data });
  }

  /** Mencari refresh token beserta data user terkait. */
  static async findRefreshTokenByHash(tokenHash: string) {
    return prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: refreshTokenWithUserInclude,
    });
  }

  /** Merotasi refresh token secara atomik: mencabut token lama dan menyimpan token baru. */
  static async rotateRefreshToken(params: {
    oldTokenId: string;
    userId: string;
    newTokenHash: string;
    newExpiresAt: Date;
    now: Date;
  }) {
    return prisma.$transaction(async (tx) => {
      const revoked = await tx.refreshToken.updateMany({
        where: { id: params.oldTokenId, revokedAt: null },
        data: { revokedAt: params.now },
      });
      if (revoked.count === 0) return false;
      await tx.refreshToken.create({
        data: {
          userId: params.userId,
          tokenHash: params.newTokenHash,
          expiresAt: params.newExpiresAt,
        },
      });
      return true;
    });
  }

  /** Mencabut refresh token tertentu milik user saat logout. */
  static async revokeRefreshToken(tokenHash: string, userId: string, now: Date) {
    return prisma.refreshToken.updateMany({
      where: { tokenHash, userId, revokedAt: null },
      data: { revokedAt: now },
    });
  }
}
