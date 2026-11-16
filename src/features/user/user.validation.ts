import { Role } from "@prisma/client";
import { z } from "zod";

const usernameRegex = /^[a-zA-Z0-9_.-]+$/;
const phoneRegex = /^[0-9+]+$/;

export class UserValidation {
  static readonly QUERY = {
    getUsers: z.object({
      page: z.coerce.number().int().positive().default(1),
      pageSize: z.coerce.number().int().positive().max(100).default(10),
      search: z.string().trim().optional(),
      role: z.nativeEnum(Role).optional(),
      isActive: z
        .enum(["true", "false"])
        .transform((val) => val === "true")
        .optional(),
      sortBy: z.enum(["name", "username", "createdAt"]).default("createdAt"),
      sortOrder: z.enum(["asc", "desc"]).default("desc"),
    }),
  };

  static readonly PARAMS = {
    id: z.object({
      id: z.string().min(1, "ID pengguna wajib disertakan."),
    }),
  };

  static readonly BODY = {
    create: z.object({
      name: z.string().trim().min(1, "Nama lengkap wajib diisi.").max(100),
      username: z
        .string()
        .trim()
        .min(3, "Username minimal 3 karakter.")
        .max(50)
        .regex(usernameRegex, "Username hanya boleh huruf, angka, titik, strip, atau underscore."),
      phone: z
        .string()
        .trim()
        .min(8, "Nomor HP minimal 8 karakter.")
        .max(20)
        .regex(phoneRegex, "Nomor HP hanya boleh berisi angka dan tanda plus (+)."),
      password: z.string().min(6, "Kata sandi minimal 6 karakter.").max(100),
      role: z.enum(["ADMIN", "SUPERVISOR"]),
      jobTitle: z.string().trim().max(50).optional(),
    }),

    update: z
      .object({
        name: z.string().trim().min(1, "Nama lengkap tidak boleh kosong.").max(100).optional(),
        username: z
          .string()
          .trim()
          .min(3, "Username minimal 3 karakter.")
          .max(50)
          .regex(usernameRegex, "Username tidak valid.")
          .optional(),
        phone: z
          .string()
          .trim()
          .min(8, "Nomor HP minimal 8 karakter.")
          .max(20)
          .regex(phoneRegex, "Nomor HP tidak valid.")
          .optional(),
        role: z.enum(["ADMIN", "SUPERVISOR"]).optional(),
        jobTitle: z.string().trim().max(50).optional(),
      })
      .refine(
        (data) => Object.keys(data).length > 0,
        "Setidaknya satu data harus disertakan untuk pembaruan.",
      ),

    resetPassword: z.object({
      newPassword: z.string().min(6, "Kata sandi baru minimal 6 karakter.").max(100),
    }),

    toggleStatus: z.object({
      isActive: z.boolean(),
    }),
  };
}
