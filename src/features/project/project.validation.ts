import { ProjectStatus } from "@prisma/client";
import { z } from "zod";

const projectCodeRegex = /^[a-zA-Z0-9_-]+$/;
const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
const activeProjectStatusSchema = z.enum([ProjectStatus.PERSIAPAN, ProjectStatus.BERJALAN]);

export class ProjectValidation {
  static readonly QUERY = {
    getProjects: z.object({
      page: z.coerce.number().int().positive().default(1),
      pageSize: z.coerce.number().int().positive().max(100).default(10),
      search: z.string().trim().optional(),
      status: activeProjectStatusSchema.optional(),
      sortBy: z.enum(["name", "code", "startDate", "createdAt"]).default("createdAt"),
      sortOrder: z.enum(["asc", "desc"]).default("desc"),
    }),

    getArchive: z.object({
      year: z.coerce.number().int().min(2000).max(2100).optional(),
      search: z.string().trim().optional(),
    }),
  };

  static readonly PARAMS = {
    id: z.object({
      id: z.string().min(1, "ID project wajib disertakan."),
    }),
  };

  static readonly BODY = {
    create: z
      .object({
        code: z
          .string()
          .trim()
          .min(2, "Kode project minimal 2 karakter.")
          .max(20, "Kode project maksimal 20 karakter.")
          .regex(projectCodeRegex, "Kode project hanya boleh huruf, angka, strip, atau underscore.")
          .transform((val) => val.toUpperCase()),
        name: z.string().trim().min(1, "Nama project wajib diisi.").max(100),
        location: z.string().trim().min(1, "Lokasi project wajib diisi.").max(200),
        clientName: z.string().trim().min(1, "Nama client wajib diisi.").max(100),
        startDate: z.string().regex(dateRegex, "Format tanggal mulai harus YYYY-MM-DD."),
        endDate: z
          .string()
          .regex(dateRegex, "Format tanggal selesai harus YYYY-MM-DD.")
          .nullable()
          .optional(),
        status: activeProjectStatusSchema.default(ProjectStatus.PERSIAPAN),
        timezone: z.string().trim().min(1, "Zona waktu wajib diisi.").default("Asia/Jakarta"),
        routineHolidays: z
          .array(z.number().int().min(0, "Hari libur 0-6.").max(6, "Hari libur 0-6."))
          .default([0]),
      })
      .refine((data) => !data.endDate || data.endDate >= data.startDate, {
        message: "Tanggal selesai project tidak boleh lebih awal dari tanggal mulai.",
        path: ["endDate"],
      }),

    update: z
      .object({
        code: z
          .string()
          .trim()
          .min(2, "Kode project minimal 2 karakter.")
          .max(20, "Kode project maksimal 20 karakter.")
          .regex(projectCodeRegex, "Kode project hanya boleh huruf, angka, strip, atau underscore.")
          .transform((val) => val.toUpperCase())
          .optional(),
        name: z.string().trim().min(1, "Nama project tidak boleh kosong.").max(100).optional(),
        location: z.string().trim().min(1, "Lokasi tidak boleh kosong.").max(200).optional(),
        clientName: z.string().trim().min(1, "Nama client tidak boleh kosong.").max(100).optional(),
        startDate: z.string().regex(dateRegex, "Format tanggal mulai harus YYYY-MM-DD.").optional(),
        endDate: z
          .string()
          .regex(dateRegex, "Format tanggal selesai harus YYYY-MM-DD.")
          .nullable()
          .optional(),
        status: activeProjectStatusSchema.optional(),
        timezone: z.string().trim().min(1).optional(),
        routineHolidays: z.array(z.number().int().min(0).max(6)).optional(),
      })
      .refine((data) => Object.keys(data).length > 0, "Setidaknya satu data harus disertakan.")
      .refine(
        (data) => !(data.startDate && data.endDate) || data.endDate >= data.startDate,
        {
          message: "Tanggal selesai project tidak boleh lebih awal dari tanggal mulai.",
          path: ["endDate"],
        },
      ),

    restore: z.object({
      status: activeProjectStatusSchema,
    }),
  };
}
