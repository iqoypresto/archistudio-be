import { prisma } from "../../configs/prisma-client.config.js";
import { parseDateOnlyUtc } from "../../helpers/date.helper.js";
import { ResponseError } from "../../utils/errors/response-error.util.js";
import type { UnlockAreaBody } from "./report-unlock.validation.js";

export class ReportUnlockService {
  /** Menyimpan rekam jejak pembukaan kunci manual area yang tertunggak (BR-22). */
  static async unlockArea(areaId: string, unlockedById: string, body: UnlockAreaBody) {
    const area = await prisma.area.findFirst({
      where: { id: areaId, deletedAt: null },
      select: { id: true, code: true, name: true, projectId: true },
    });

    if (!area) {
      throw new ResponseError("RESOURCE_NOT_FOUND");
    }

    const unlock = await prisma.reportUnlock.create({
      data: {
        areaId,
        unlockedById,
        unlockedThroughDate: parseDateOnlyUtc(body.unlockedThroughDate),
        reason: body.reason.trim(),
      },
      select: {
        id: true,
        areaId: true,
        unlockedThroughDate: true,
        reason: true,
        createdAt: true,
        unlockedBy: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
      },
    });

    return {
      ...unlock,
      unlockedThroughDate: unlock.unlockedThroughDate.toISOString().slice(0, 10),
    };
  }
}
