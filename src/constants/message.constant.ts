export const AUTH_MESSAGES = {
  LOGIN_SUCCESS: "Login berhasil.",
  REFRESH_SUCCESS: "Sesi berhasil diperbarui.",
  LOGOUT_SUCCESS: "Logout berhasil.",
  PROFILE_FETCHED: "Profil pengguna berhasil diambil.",
} as const;

export const USER_MESSAGES = {
  LIST_FETCHED: "Daftar pengguna berhasil diambil.",
  DETAIL_FETCHED: "Detail pengguna berhasil diambil.",
  CREATED: "Akun pengguna berhasil dibuat.",
  UPDATED: "Data pengguna berhasil diperbarui.",
  PASSWORD_RESET: "Kata sandi pengguna berhasil di-reset.",
  STATUS_UPDATED: "Status pengguna berhasil diperbarui.",
} as const;

export const COMMON_MESSAGES = {
  HEALTH_OK: "Layanan API ArchiStudio berjalan normal.",
  FETCHED: "Data berhasil diambil.",
  CREATED: "Data berhasil dibuat.",
  UPDATED: "Data berhasil diperbarui.",
} as const;
