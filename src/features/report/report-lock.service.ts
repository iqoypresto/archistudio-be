import { isRestDay, toBusinessDateString } from "../../helpers/date.helper.js";
import { PaginationHelper } from "../../helpers/pagination.helper.js";
import { ResponseError } from "../../utils/errors/response-error.util.js";
import { evaluateAreaLock } from "./report-lock.helper.js";
import {
  ReportLockRepository,
  type ActiveAssignmentRecord,
} from "./report-lock.repository.js";
import type {
  ListMyReportWorkItemsQuery,
  PaginatedSupervisorReportWorkItems,
  SupervisorAreaTaskStatus,
  SupervisorReportWorkItem,
} from "./report-lock.type.js";

function toDateStr(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Memetakan satu record penugasan menjadi status kewajiban lapor terhitung. */
function mapAssignmentToAreaTaskStatus(
  record: ActiveAssignmentRecord,
  now: Date,
): SupervisorAreaTaskStatus {
  const { area } = record;
  const { project } = area;
  const todayDate = toBusinessDateString(now, project.timezone);
  const latestUnlock = area.unlocks[0];
  const { lockState, submittedDates } = evaluateAreaLock({
    projectStartDate: area.project.startDate,
    projectEndDate: area.project.endDate,
    assignmentStartDate: record.startDate,
    assignmentEndDate: record.endDate,
    todayDate,
    routineHolidays: area.project.routineHolidays,
    reports: area.reports,
    unlockedThroughDate: latestUnlock?.unlockedThroughDate ?? null,
  });
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
    return assignments.map((record) => mapAssignmentToAreaTaskStatus(record, now));
  }

  /** Menyusun daftar laporan terlambat dan kewajiban belum terkirim; filter dan paging tetap di backend. */
  static async listMyReportWorkItems(
    supervisorId: string,
    query: ListMyReportWorkItemsQuery,
    now = new Date(),
  ): Promise<PaginatedSupervisorReportWorkItems> {
    const [assignments, lateReports] = await Promise.all([
      ReportLockRepository.findActiveAssignmentsForSupervisor(supervisorId),
      ReportLockRepository.findLateReportsForSupervisor(supervisorId),
    ]);
    const areas = assignments.map((record) => mapAssignmentToAreaTaskStatus(record, now));

    const pendingItems: SupervisorReportWorkItem[] = areas.flatMap((area) =>
      area.pendingDates.map((reportDate) => {
        const canCreate = reportDate === area.nextRequiredDate;
        const isOverdue = reportDate < area.todayDate;
        const status = isOverdue ? "OVERDUE" : canCreate ? "READY" : "WAITING";
        return {
          id: `obligation:${area.areaId}:${reportDate}`,
          reportId: null,
          projectId: area.projectId,
          projectName: area.projectName,
          areaId: area.areaId,
          areaCode: area.areaCode,
          areaName: area.areaName,
          reportDate,
          status,
          action: canCreate ? "CREATE_REPORT" : "WAIT",
        };
      }),
    );

    const lateItems: SupervisorReportWorkItem[] = lateReports.map((report) => ({
      id: `late:${report.id}`,
      reportId: report.id,
      projectId: report.area.project.id,
      projectName: report.area.project.name,
      areaId: report.area.id,
      areaCode: report.area.code,
      areaName: report.area.name,
      reportDate: toDateStr(report.reportDate),
      status: "LATE",
      action: "VIEW_REPORT",
    }));

    const allItems = [...pendingItems, ...lateItems]
      .filter((item) =>
        query.status === "ALL" ||
        (query.status === "LATE" && item.status === "LATE") ||
        (query.status === "OVERDUE" && item.status === "OVERDUE"),
      )
      .sort((a, b) =>
        a.reportDate.localeCompare(b.reportDate) ||
        a.projectName.localeCompare(b.projectName, "id") ||
        a.areaName.localeCompare(b.areaName, "id"),
      );

    const { page, pageSize, skip, take } = PaginationHelper.getSkipTake(query.page, query.pageSize);
    return {
      items: allItems.slice(skip, skip + take),
      meta: PaginationHelper.buildMeta(page, pageSize, allItems.length),
    };
  }

  /** Memastikan tidak ada tanggal wajib lapor lebih lama yang mengunci tanggal target (BR-20). */
  static assertDateUnlocked(pendingDates: string[], targetReportDate: string): void {
    if (pendingDates.some((d) => d < targetReportDate)) {
      throw new ResponseError("PREVIOUS_DATE_REPORT_LOCKED");
    }
  }
}
