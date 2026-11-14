const MS_PER_DAY = 86_400_000;

export interface ComputeAreaLockParams {
  projectStartDate: string;
  projectEndDate?: string | null;
  assignmentStartDate: string;
  assignmentEndDate?: string | null;
  todayDate: string;
  routineHolidays: number[];
  submittedDates: string[];
  unlockedThroughDate?: string | null;
  overdueThresholdDays?: number;
}

export interface AreaLockState {
  pendingDates: string[];
  nextRequiredDate: string | null;
  todayDate: string;
  isTodayLocked: boolean;
  overdueBusinessDaysCount: number;
  isOverdueMoreThan3Days: boolean;
  oldestOverdueDate: string | null;
}

/** Mengubah Date UTC menjadi string YYYY-MM-DD pada zona waktu IANA project. */
export function toBusinessDateString(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Mengubah YYYY-MM-DD menjadi Date UTC pukul 00:00:00Z untuk kolom @db.Date. */
export function parseDateOnlyUtc(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

/** Menambahkan sejumlah hari pada string tanggal YYYY-MM-DD secara deterministik. */
export function addDaysToDateString(dateStr: string, days: number): string {
  const baseMs = parseDateOnlyUtc(dateStr).getTime();
  return new Date(baseMs + days * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Mengecek apakah YYYY-MM-DD termasuk hari libur rutin project (BR-11). */
export function isRestDay(dateStr: string, routineHolidays: number[]): boolean {
  const dayOfWeek = parseDateOnlyUtc(dateStr).getUTCDay();
  return routineHolidays.includes(dayOfWeek);
}

/** Mengambil jam, menit, dan detik lokal pada zona waktu project. */
function getLocalClockParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  return { hour: pick("hour"), minute: pick("minute"), second: pick("second") };
}

/** Mengecek apakah waktu kirim melewati batas pukul 17:00 waktu project (BR-18). */
export function isPastCutoff(
  submittedAt: Date,
  reportDateStr: string,
  timeZone: string,
  cutoffHour = 17,
): boolean {
  const submittedDateStr = toBusinessDateString(submittedAt, timeZone);
  if (submittedDateStr < reportDateStr) return false;
  if (submittedDateStr > reportDateStr) return true;
  const clock = getLocalClockParts(submittedAt, timeZone);
  if (clock.hour > cutoffHour) return true;
  return clock.hour === cutoffHour && (clock.minute > 0 || clock.second > 0);
}

/** Menentukan tanggal paling lambat atau paling awal dari daftar kandidat tanggal. */
function pickBoundaryDate(dates: (string | null | undefined)[], mode: "max" | "min") {
  const valid = dates.filter((d): d is string => Boolean(d));
  return valid.reduce((acc, cur) =>
    mode === "max" ? (cur > acc ? cur : acc) : cur < acc ? cur : acc,
  );
}

/** Menghitung daftar tanggal wajib lapor yang belum dikirim dari terlama ke terbaru. */
function collectPendingDates(
  start: string,
  end: string,
  routineHolidays: number[],
  submittedSet: Set<string>,
): string[] {
  const pending: string[] = [];
  for (let cur = start; cur <= end; cur = addDaysToDateString(cur, 1)) {
    if (!isRestDay(cur, routineHolidays) && !submittedSet.has(cur)) {
      pending.push(cur);
    }
  }
  return pending;
}

/** Menentukan batas tanggal awal dan akhir evaluasi status wajib lapor. */
function resolveEvaluationWindow(params: ComputeAreaLockParams) {
  const unlockNext = params.unlockedThroughDate
    ? addDaysToDateString(params.unlockedThroughDate, 1)
    : null;
  const start = pickBoundaryDate(
    [params.projectStartDate, params.assignmentStartDate, unlockNext],
    "max",
  );
  const end = pickBoundaryDate(
    [params.todayDate, params.projectEndDate, params.assignmentEndDate],
    "min",
  );
  return { start, end };
}

/** Menghitung state kunci bertahap & tunggakan > 3 hari kerja per area (ADR-04). */
export function computeAreaLockState(params: ComputeAreaLockParams): AreaLockState {
  const { start, end } = resolveEvaluationWindow(params);
  const submitted = new Set(params.submittedDates);
  const pendingDates =
    start <= end ? collectPendingDates(start, end, params.routineHolidays, submitted) : [];
  const overdueDates = pendingDates.filter((d) => d < params.todayDate);
  const threshold = params.overdueThresholdDays ?? 3;
  return {
    pendingDates,
    nextRequiredDate: pendingDates[0] ?? null,
    todayDate: params.todayDate,
    isTodayLocked: overdueDates.length > 0,
    overdueBusinessDaysCount: overdueDates.length,
    isOverdueMoreThan3Days: overdueDates.length > threshold,
    oldestOverdueDate: overdueDates[0] ?? null,
  };
}
