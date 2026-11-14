import { z } from "zod";

export class AuthValidation {
  static readonly BODY = {
    login: z.object({
      identifier: z
        .string()
        .trim()
        .min(3, "Masukkan nomor HP atau username minimal 3 karakter."),
      password: z.string().min(6, "Kata sandi minimal 6 karakter."),
    }),
    refresh: z.object({
      refreshToken: z.string().min(1, "Refresh token wajib disertakan."),
    }),
    logout: z.object({
      refreshToken: z.string().min(1, "Refresh token wajib disertakan."),
    }),
  };
}
