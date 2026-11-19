import { prisma } from "../../configs/prisma-client.config.js";
import { parseDateOnlyUtc } from "../../helpers/date.helper.js";

export class ReportUnlockRepository {
  /** Memuat data zona waktu dan tanggal yang diperlukan untuk validasi ambang unlock. */
  static async findAreaLockData(areaId: string) {
    return prisma.area.findFirst({
      where: { id: areaId, deletedAt: null, project: { deletedAt: null } },
      select: {
        id: true,
        project: {
          select: {
            startDate: true,
            endDate: true,
            timezone: true,
            routineHolidays: true,
          },
        },
        assignments: {
          where: { endDate: null },
          orderBy: { startDate: "desc" },
          take: 1,
          select: { startDate: true, endDate: true },
        },
        reports: { select: { reportDate: true, status: true } },
        unlocks: {
          orderBy: { unlockedThroughDate: "desc" },
          take: 1,
          select: { unlockedThroughDate: true },
        },
      },
    });
  }

  /** Menyimpan audit pembukaan kunci dengan alasan default untuk kolom DB wajib. */
  static async createUnlock(
    areaId: string,
    unlockedById: string,
    data: { unlockedThroughDate: string; reason?: string },
  ) {
    return prisma.reportUnlock.create({
      data: {
        areaId,
        unlockedById,
        unlockedThroughDate: parseDateOnlyUtc(data.unlockedThroughDate),
        reason: data.reason?.trim() || "Pembukaan kunci manual oleh Owner/Admin.",
      },
      select: {
        id: true,
        areaId: true,
        unlockedThroughDate: true,
        reason: true,
        createdAt: true,
        unlockedBy: { select: { id: true, name: true, role: true } },
      },
    });
  }
}
