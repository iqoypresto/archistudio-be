import { StatusCodes } from "http-status-codes";

export interface AppErrorDef {
  readonly code: string;
  readonly status: number;
  readonly message: string;
}

export const AppErrors = {
  AUTHENTICATION_REQUIRED: {
    code: "AUTHENTICATION_REQUIRED",
    status: StatusCodes.UNAUTHORIZED,
    message: "Anda belum login atau sesi telah berakhir.",
  },
  ACCESS_TOKEN_EXPIRED: {
    code: "ACCESS_TOKEN_EXPIRED",
    status: StatusCodes.UNAUTHORIZED,
    message: "Sesi kedaluwarsa. Memperbarui sesi Anda.",
  },
  INVALID_CREDENTIALS: {
    code: "INVALID_CREDENTIALS",
    status: StatusCodes.UNAUTHORIZED,
    message: "Nomor HP/username atau kata sandi salah.",
  },
  REFRESH_TOKEN_INVALID: {
    code: "REFRESH_TOKEN_INVALID",
    status: StatusCodes.UNAUTHORIZED,
    message: "Sesi tidak valid atau telah dicabut. Silakan login ulang.",
  },
  ACCOUNT_INACTIVE: {
    code: "ACCOUNT_INACTIVE",
    status: StatusCodes.FORBIDDEN,
    message: "Akun Anda sedang dinonaktifkan. Hubungi Owner atau Admin.",
  },
  FORBIDDEN: {
    code: "FORBIDDEN",
    status: StatusCodes.FORBIDDEN,
    message: "Anda tidak memiliki akses untuk melakukan aksi ini.",
  },
  AREA_SCOPE_FORBIDDEN: {
    code: "AREA_SCOPE_FORBIDDEN",
    status: StatusCodes.FORBIDDEN,
    message: "Anda hanya dapat mengakses area yang ditugaskan kepada Anda.",
  },
  ASSIGNMENT_ENDED: {
    code: "ASSIGNMENT_ENDED",
    status: StatusCodes.FORBIDDEN,
    message: "Masa penugasan Anda pada area ini telah berakhir untuk tanggal laporan tersebut.",
  },
  REPORT_LOCKED_AFTER_SUBMIT: {
    code: "REPORT_LOCKED_AFTER_SUBMIT",
    status: StatusCodes.FORBIDDEN,
    message: "Laporan yang sudah terkirim tidak dapat diubah. Hanya Owner yang berwenang merevisi.",
  },
  RESOURCE_NOT_FOUND: {
    code: "RESOURCE_NOT_FOUND",
    status: StatusCodes.NOT_FOUND,
    message: "Data tidak ditemukan.",
  },
  CONFLICT: {
    code: "CONFLICT",
    status: StatusCodes.CONFLICT,
    message: "Terjadi konflik data.",
  },
  DAILY_REPORTS_INCOMPLETE: {
    code: "DAILY_REPORTS_INCOMPLETE",
    status: StatusCodes.CONFLICT,
    message: "PDF belum dapat dibuat karena masih ada area wajib lapor yang belum mengirim laporan.",
  },
  AREA_ALREADY_HAS_ACTIVE_SUPERVISOR: {
    code: "AREA_ALREADY_HAS_ACTIVE_SUPERVISOR",
    status: StatusCodes.CONFLICT,
    message: "Area ini sudah memiliki supervisor aktif. Gunakan fitur ganti supervisor untuk menggantinya.",
  },
  REPORT_ALREADY_EXISTS: {
    code: "REPORT_ALREADY_EXISTS",
    status: StatusCodes.CONFLICT,
    message: "Laporan untuk area dan tanggal ini sudah dikirim.",
  },
  UNLOCK_THRESHOLD_NOT_REACHED: {
    code: "UNLOCK_THRESHOLD_NOT_REACHED",
    status: StatusCodes.CONFLICT,
    message: "Pembukaan kunci hanya tersedia setelah tunggakan melewati 3 hari kerja wajib lapor.",
  },
  DUPLICATE_REPORT_NUMBER: {
    code: "DUPLICATE_REPORT_NUMBER",
    status: StatusCodes.CONFLICT,
    message: "Nomor laporan sudah terdaftar.",
  },
  INVALID_PROJECT_DATES: {
    code: "INVALID_PROJECT_DATES",
    status: StatusCodes.BAD_REQUEST,
    message: "Tanggal selesai project tidak boleh lebih awal dari tanggal mulai.",
  },
  INVALID_ASSIGNMENT_DATE: {
    code: "INVALID_ASSIGNMENT_DATE",
    status: StatusCodes.BAD_REQUEST,
    message: "Tanggal efektif penugasan baru harus lebih baru dari tanggal mulai penugasan aktif saat ini.",
  },
  SUPERVISOR_NOT_ACTIVE: {
    code: "SUPERVISOR_NOT_ACTIVE",
    status: StatusCodes.BAD_REQUEST,
    message: "Supervisor yang dipilih tidak aktif atau bukan peran Supervisor.",
  },
  INVALID_PHOTO_COUNT: {
    code: "INVALID_PHOTO_COUNT",
    status: StatusCodes.BAD_REQUEST,
    message: "Jumlah foto laporan harus antara 1 sampai 10 foto.",
  },
  NO_WORK_REASON_OR_PHOTO_REQUIRED: {
    code: "NO_WORK_REASON_OR_PHOTO_REQUIRED",
    status: StatusCodes.BAD_REQUEST,
    message: "Hari tanpa pekerjaan wajib memilih alasan dan mengunggah minimal 1 foto bukti.",
  },
  UNSUPPORTED_FILE_TYPE: {
    code: "UNSUPPORTED_FILE_TYPE",
    status: StatusCodes.BAD_REQUEST,
    message: "Format file tidak didukung untuk fitur ini.",
  },
  FILE_TOO_LARGE: {
    code: "FILE_TOO_LARGE",
    status: StatusCodes.REQUEST_TOO_LONG,
    message: "Ukuran file melebihi batas untuk fitur ini.",
  },
  DATE_RANGE_TOO_LONG: {
    code: "DATE_RANGE_TOO_LONG",
    status: StatusCodes.BAD_REQUEST,
    message: "Rentang tanggal maksimal 7 hari kalender.",
  },
  INVALID_STORAGE_KEY: {
    code: "INVALID_STORAGE_KEY",
    status: StatusCodes.BAD_REQUEST,
    message: "Referensi file foto tidak valid atau bukan milik area ini.",
  },
  VALIDATION_ERROR: {
    code: "VALIDATION_ERROR",
    status: StatusCodes.UNPROCESSABLE_ENTITY,
    message: "Data yang dikirim tidak valid.",
  },
  PROJECT_ALREADY_COMPLETED: {
    code: "PROJECT_ALREADY_COMPLETED",
    status: StatusCodes.UNPROCESSABLE_ENTITY,
    message: "Project sudah berstatus selesai dan tidak menerima laporan baru.",
  },
  PREVIOUS_DATE_REPORT_LOCKED: {
    code: "PREVIOUS_DATE_REPORT_LOCKED",
    status: StatusCodes.LOCKED,
    message: "Laporan tanggal ini terkunci karena masih ada tanggal sebelumnya yang belum dilaporkan.",
  },
} as const satisfies Record<string, AppErrorDef>;

export type AppErrorKey = keyof typeof AppErrors;
