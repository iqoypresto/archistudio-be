import { ReportStatus } from "@prisma/client";
import {
  computeAreaLockState,
  isRestDay,
  toBusinessDateString,
  type AreaLockState,
} from "../../helpers/date.helper.js";
import { ResponseError } from "../../utils/errors/response-error.util.js";
import {
  ReportLockRepository,
  type ActiveAssignmentRecord,
} from "./report-lock.repository.js";
import type { SupervisorAreaTaskStatus } from "./report-lock.type.js";

function toDateStr(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Mencari draf aktif milik supervisor pada tanggal wajib berikutnya atau hari ini. */
function resolveDraftReport(
  reports: ActiveAssignmentRecord["area"]["reports"],
  supervisorId: string,
  nextRequiredDate: string | null,
  todayDate: string,
): { draftReportId: string | null; draftReportDate: string | null } {
  const drafts = reports.filter(
    (r) => r.status === ReportStatus.DRAFT && r.supervisorId === supervisorId,
  );
  const targetDate = nextRequiredDate ?? todayDate;
  const matched =
    drafts.find((r) => toDateStr(r.reportDate) === targetDate) ??
    drafts.find((r) => toDateStr(r.reportDate) === todayDate);
  if (!matched) {
    return { draftReportId: null, draftReportDate: null };
  }
  return {
    draftReportId: matched.id,
    draftReportDate: toDateStr(matched.reportDate),
  };
}

/** Menghitung lock state & daftar tanggal terkirim untuk satu area (BR-11, BR-20). */
function evaluateAreaLock(
  record: ActiveAssignmentRecord,
  todayDate: string,
): { lockState: AreaLockState; submittedDates: string[] } {
  const { project, reports, unlocks } = record.area;
  const submittedDates = reports
    .filter((r) => r.status === ReportStatus.SUBMITTED)
    .map((r) => toDateStr(r.reportDate));
  const latestUnlock = unlocks[0];
  const lockState = computeAreaLockState({
    projectStartDate: toDateStr(project.startDate),
    projectEndDate: project.endDate ? toDateStr(project.endDate) : null,
    assignmentStartDate: toDateStr(record.startDate),
    assignmentEndDate: record.endDate ? toDateStr(record.endDate) : null,
    todayDate,
    routineHolidays: project.routineHolidays,
    submittedDates,
    unlockedThroughDate: latestUnlock ? toDateStr(latestUnlock.unlockedThroughDate) : null,
  });
  return { lockState, submittedDates };
}

/** Memetakan satu record penugasan menjadi status kewajiban lapor terhitung. */
function mapAssignmentToAreaTaskStatus(
  record: ActiveAssignmentRecord,
  supervisorId: string,
  now: Date,
): SupervisorAreaTaskStatus {
  const { area } = record;
  const { project } = area;
  const todayDate = toBusinessDateString(now, project.timezone);
  const { lockState, submittedDates } = evaluateAreaLock(record, todayDate);
  const draft = resolveDraftReport(area.reports, supervisorId, lockState.nextRequiredDate, todayDate);
  return {
    areaId: area.id,
    areaCode: area.code,
    areaName: area.name,
    projectId: project.id,
    projectCode: project.code,
    projectName: project.name,
    projectLocation: project.location,
    timezone: project.timezone,
    routineHolidays: project.routineHolidays,
    assignmentStartDate: toDateStr(record.startDate),
    assignmentEndDate: record.endDate ? toDateStr(record.endDate) : null,
    pendingDates: lockState.pendingDates,
    overdueDates: lockState.pendingDates.filter((d) => d < todayDate),
    nextRequiredDate: lockState.nextRequiredDate,
    todayDate,
    isTodayLocked: lockState.isTodayLocked,
    isTodayRestDay: isRestDay(todayDate, project.routineHolidays),
    isTodaySubmitted: submittedDates.includes(todayDate),
    overdueBusinessDaysCount: lockState.overdueBusinessDaysCount,
    isOverdueMoreThan3Days: lockState.isOverdueMoreThan3Days,
    oldestOverdueDate: lockState.oldestOverdueDate,
    draftReportId: draft.draftReportId,
    draftReportDate: draft.draftReportDate,
  };
}

export class ReportLockService {
  /** Mengambil status kewajiban lapor dan kunci bertahap seluruh area supervisor (US-07, US-10). */
  static async getMyAreasStatus(
    supervisorId: string,
    now = new Date(),
  ): Promise<SupervisorAreaTaskStatus[]> {
    const assignments =
      await ReportLockRepository.findActiveAssignmentsForSupervisor(supervisorId);
    return assignments.map((record) =>
      mapAssignmentToAreaTaskStatus(record, supervisorId, now),
    );
  }

  /** Memastikan tidak ada tanggal wajib lapor lebih lama yang mengunci tanggal target (BR-20). */
  static assertDateUnlocked(pendingDates: string[], targetReportDate: string): void {
    if (pendingDates.some((d) => d < targetReportDate)) {
      throw new ResponseError("PREVIOUS_DATE_REPORT_LOCKED");
    }
  }
}
