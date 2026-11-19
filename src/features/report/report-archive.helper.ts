import { toBusinessDateString } from "../../helpers/date.helper.js";

/** BR-25: tanggal bisnis, bukan umur 24 jam atau cutoff 17:00. */
export function archiveTimestamp(reportDate: Date, timezone: string, now: Date): Date | null {
  return reportDate.toISOString().slice(0, 10) < toBusinessDateString(now, timezone) ? now : null;
}
