import { Role } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { ReportUnlockService } from "../src/features/report/report-unlock.service.js";
import { ReportUnlockRepository } from "../src/features/report/report-unlock.repository.js";

type AreaLockData = NonNullable<
  Awaited<ReturnType<typeof ReportUnlockRepository.findAreaLockData>>
>;
type UnlockRecord = Awaited<ReturnType<typeof ReportUnlockRepository.createUnlock>>;

const areaLockData: AreaLockData = {
  id: "area-1",
  project: {
    startDate: new Date("2026-11-01T00:00:00.000Z"),
    endDate: null,
    timezone: "Asia/Jakarta",
    routineHolidays: [0],
  },
  assignments: [],
  reports: [],
  unlocks: [],
};

const unlockRecord: UnlockRecord = {
  id: "unlock-1",
  areaId: "area-1",
  unlockedThroughDate: new Date("2026-11-18T00:00:00.000Z"),
  reason: "Dispensasi kendala cuaca ekstrem di lapangan",
  createdAt: new Date("2026-11-19T10:00:00.000Z"),
  unlockedBy: {
    id: "owner-1",
    name: "Budi Santoso",
    role: Role.OWNER,
  },
};

describe("TASK-08 Backend Buka Kunci Area Tertunggak (BR-22)", () => {
  it("[US-11 / BR-22] berhasil membuka kunci manual area dan mencatat alasan pembukaan", async () => {
    vi.spyOn(ReportUnlockRepository, "findAreaLockData").mockResolvedValue(areaLockData);
    vi.spyOn(ReportUnlockRepository, "createUnlock").mockResolvedValue(unlockRecord);

    const result = await ReportUnlockService.unlockArea("area-1", "owner-1", {
      unlockedThroughDate: "2026-11-18",
      reason: "Dispensasi kendala cuaca ekstrem di lapangan",
    }, new Date("2026-11-19T12:00:00.000Z"));

    expect(result.id).toBe("unlock-1");
    expect(result.unlockedThroughDate).toBe("2026-11-18");
    expect(result.reason).toContain("cuaca ekstrem");
    expect(result.unlockedBy.role).toBe(Role.OWNER);
  });

  it("[BR-22] menolak jika area tidak ditemukan", async () => {
    vi.spyOn(ReportUnlockRepository, "findAreaLockData").mockResolvedValue(null);

    await expect(
      ReportUnlockService.unlockArea("area-none", "owner-1", {
        unlockedThroughDate: "2026-11-05",
        reason: "Alasan sembarang",
      }),
    ).rejects.toThrow("Data tidak ditemukan");
  });
});
