import type { Prisma } from "@prisma/client";
import { parseDateOnlyUtc, toBusinessDateString } from "../../helpers/date.helper.js";
import { ReportArchiveRepository } from "./report-archive.repository.js";

export class ReportArchiveService {
  /** Mengarsipkan laporan eligible pada scope yang sudah diotorisasi, tanpa cron (BR-25). */
  static async process(scope: Prisma.DailyReportWhereInput, now = new Date()): Promise<void> {
    const timezones = await ReportArchiveRepository.findTimezones(scope);
    for (const timezone of timezones) {
      const today = parseDateOnlyUtc(toBusinessDateString(now, timezone));
      await ReportArchiveRepository.archiveBefore(scope, timezone, today, now);
    }
  }
}
