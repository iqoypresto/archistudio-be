import { z } from "zod";

export const unlockAreaParamsSchema = z.object({
  areaId: z.string().uuid("Format areaId harus UUID"),
});

export const unlockAreaBodySchema = z.object({
  unlockedThroughDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD"),
  reason: z
    .string()
    .min(5, "Alasan pembukaan kunci minimal 5 karakter")
    .max(500, "Alasan pembukaan kunci maksimal 500 karakter"),
});

export type UnlockAreaBody = z.infer<typeof unlockAreaBodySchema>;
