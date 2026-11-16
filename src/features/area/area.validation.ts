import { z } from "zod";

const areaCodeRegex = /^[a-zA-Z0-9_-]+$/;
const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

export class AreaValidation {
  static readonly PARAMS = {
    projectId: z.object({
      projectId: z.string().min(1, "ID project wajib disertakan."),
    }),
    areaId: z.object({
      areaId: z.string().min(1, "ID area wajib disertakan."),
    }),
  };

  static readonly BODY = {
    create: z.object({
      code: z
        .string()
        .trim()
        .min(1, "Kode area minimal 1 karakter.")
        .max(20, "Kode area maksimal 20 karakter.")
        .regex(areaCodeRegex, "Kode area hanya boleh huruf, angka, strip, atau underscore.")
        .transform((val) => val.toUpperCase()),
      name: z.string().trim().min(1, "Nama area wajib diisi.").max(100),
      initialSupervisorId: z.string().min(1, "Supervisor awal wajib dipilih."),
      startDate: z.string().regex(dateRegex, "Format tanggal mulai harus YYYY-MM-DD."),
    }),

    update: z
      .object({
        code: z
          .string()
          .trim()
          .min(1, "Kode area minimal 1 karakter.")
          .max(20, "Kode area maksimal 20 karakter.")
          .regex(areaCodeRegex, "Kode area hanya boleh huruf, angka, strip, atau underscore.")
          .transform((val) => val.toUpperCase())
          .optional(),
        name: z.string().trim().min(1, "Nama area tidak boleh kosong.").max(100).optional(),
      })
      .refine(
        (data) => Object.keys(data).length > 0,
        "Setidaknya satu data harus disertakan untuk pembaruan area.",
      ),

    assignSupervisor: z.object({
      supervisorId: z.string().min(1, "Supervisor wajib dipilih."),
      effectiveStartDate: z.string().regex(dateRegex, "Format tanggal efektif harus YYYY-MM-DD."),
    }),
  };
}
