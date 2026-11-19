import { ReportStatus } from "@prisma/client";
import { computeAreaLockState, type AreaLockState } from "../../helpers/date.helper.js";

interface LockReportRecord {
  reportDate: Date;
  status: ReportStatus;
}

interface AreaLockInput {
  projectStartDate: Date;
  projectEndDate: Date | null;
  assignmentStartDate: Date;
  assignmentEndDate: Date | null;
  todayDate: string;
  routineHolidays: number[];
  reports: LockReportRecord[];
  unlockedThroughDate: Date | null;
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Menyatukan kalkulasi tanggal wajib lapor untuk dashboard, supervisor, dan admin unlock. */
export function evaluateAreaLock(input: AreaLockInput): {
  lockState: AreaLockState;
  submittedDates: string[];
} {
  const submittedDates = input.reports
    .filter((report) => report.status === ReportStatus.SUBMITTED)
    .map((report) => toDateString(report.reportDate));
  const lockState = computeAreaLockState({
    projectStartDate: toDateString(input.projectStartDate),
    projectEndDate: input.projectEndDate ? toDateString(input.projectEndDate) : null,
    assignmentStartDate: toDateString(input.assignmentStartDate),
    assignmentEndDate: input.assignmentEndDate ? toDateString(input.assignmentEndDate) : null,
    todayDate: input.todayDate,
    routineHolidays: input.routineHolidays,
    submittedDates,
    unlockedThroughDate: input.unlockedThroughDate
      ? toDateString(input.unlockedThroughDate)
      : null,
  });
  return { lockState, submittedDates };
}
