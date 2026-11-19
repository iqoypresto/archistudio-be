import { Role } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { prisma } from "../src/configs/prisma-client.config.js";
import { ReportUnlockService } from "../src/features/report/report-unlock.service.js";

describe("TASK-08 Backend Buka Kunci Area Tertunggak (BR-22)", () => {
  it("[US-11 / BR-22] berhasil membuka kunci manual area dan mencatat alasan pembukaan", async () => {
    vi.spyOn(prisma.area, "findFirst").mockResolvedValue({
      id: "area-1",
      code: "A",
      name: "Struktur",
      projectId: "proj-1",
    } as unknown as Awaited<ReturnType<typeof prisma.area.findFirst>>);

    vi.spyOn(prisma.reportUnlock, "create").mockResolvedValue({
      id: "unlock-1",
      areaId: "area-1",
      unlockedById: "owner-1",
      unlockedThroughDate: new Date("2026-11-05T00:00:00.000Z"),
      reason: "Dispensasi kendala cuaca ekstrem di lapangan",
      createdAt: new Date("2026-11-06T10:00:00.000Z"),
      unlockedBy: {
        id: "owner-1",
        name: "Budi Santoso",
        role: Role.OWNER,
      },
    } as unknown as Awaited<ReturnType<typeof prisma.reportUnlock.create>>);

    const result = await ReportUnlockService.unlockArea("area-1", "owner-1", {
      unlockedThroughDate: "2026-11-05",
      reason: "Dispensasi kendala cuaca ekstrem di lapangan",
    });

    expect(result.id).toBe("unlock-1");
    expect(result.unlockedThroughDate).toBe("2026-11-05");
    expect(result.reason).toContain("cuaca ekstrem");
    expect(result.unlockedBy.role).toBe(Role.OWNER);
  });

  it("[BR-22] menolak jika area tidak ditemukan", async () => {
    vi.spyOn(prisma.area, "findFirst").mockResolvedValue(null);

    await expect(
      ReportUnlockService.unlockArea("area-none", "owner-1", {
        unlockedThroughDate: "2026-11-05",
        reason: "Alasan sembarang",
      }),
    ).rejects.toThrow("Data tidak ditemukan");
  });
});
