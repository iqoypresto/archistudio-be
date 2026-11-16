import { ReportStatus } from "@prisma/client";
import {
  computeAreaLockState,
  isRestDay,
  parseDateOnlyUtc,
  toBusinessDateString,
} from "../../helpers/date.helper.js";
import { DashboardRepository } from "./dashboard.repository.js";
import type {
  AreaDailyStatusType,
  DashboardAreaStatusItem,
  DashboardKpiMetrics,
  DashboardStatusFilter,
  DashboardSummaryResponse,
  SupervisorLatenessItem,
} from "./dashboard.type.js";
import type {
  DashboardSummaryQuery,
  SupervisorLatenessQuery,
} from "./dashboard.validation.js";

type AreaDetailRecord = Awaited<
  ReturnType<typeof DashboardRepository.findActiveAreasWithDetails>
>[number];

function toDateStr(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Menentukan status harian laporan pada tanggal target (BR-11, BR-18, BR-21). */
function resolveAreaDailyStatus(
  targetReport: AreaDetailRecord["reports"][number] | undefined,
  targetDate: string,
  routineHolidays: number[],
): AreaDailyStatusType {
  if (targetReport && targetReport.status === ReportStatus.SUBMITTED) {
    return targetReport.isLate ? "TERLAMBAT" : "TERKIRIM";
  }
  if (isRestDay(targetDate, routineHolidays)) {
    return "LIBUR_RUTIN";
  }
  return "BELUM_LAPOR";
}

/** Menghitung evaluasi kunci dan status harian untuk satu record area. */
function evaluateAreaItem(
  area: AreaDetailRecord,
  targetDate: string,
): DashboardAreaStatusItem {
  const assignment = area.assignments[0];
  const submittedDates = area.reports
    .filter((r) => r.status === ReportStatus.SUBMITTED)
    .map((r) => toDateStr(r.reportDate));
  const latestUnlock = area.unlocks[0];

  const lockState = computeAreaLockState({
    projectStartDate: toDateStr(area.project.startDate),
    projectEndDate: area.project.endDate ? toDateStr(area.project.endDate) : null,
    assignmentStartDate: assignment ? toDateStr(assignment.startDate) : toDateStr(area.project.startDate),
    assignmentEndDate: assignment?.endDate ? toDateStr(assignment.endDate) : null,
    todayDate: targetDate,
    routineHolidays: area.project.routineHolidays,
    submittedDates,
    unlockedThroughDate: latestUnlock ? toDateStr(latestUnlock.unlockedThroughDate) : null,
  });

  const targetReport = area.reports.find(
    (r) => toDateStr(r.reportDate) === targetDate && r.status === ReportStatus.SUBMITTED,
  );
  const status = resolveAreaDailyStatus(targetReport, targetDate, area.project.routineHolidays);

  return {
    areaId: area.id,
    areaCode: area.code,
    areaName: area.name,
    projectId: area.project.id,
    projectCode: area.project.code,
    projectName: area.project.name,
    projectTimezone: area.project.timezone,
    supervisor: assignment ? assignment.supervisor : null,
    status,
    reportId: targetReport?.id ?? null,
    reportNumber: targetReport?.reportNumber ?? null,
    submittedAt: targetReport?.submittedAt ? targetReport.submittedAt.toISOString() : null,
    isLate: targetReport?.isLate ?? false,
    overdueBusinessDaysCount: lockState.overdueBusinessDaysCount,
    isOverdueMoreThan3Days: lockState.isOverdueMoreThan3Days,
    oldestOverdueDate: lockState.oldestOverdueDate,
    latestUnlock: latestUnlock
      ? {
          unlockedThroughDate: toDateStr(latestUnlock.unlockedThroughDate),
          reason: latestUnlock.reason,
        }
      : null,
  };
}

/** Memfilter daftar status area berdasarkan filter pilihan user di dashboard. */
function filterAreaList(
  items: DashboardAreaStatusItem[],
  filter: DashboardStatusFilter,
): DashboardAreaStatusItem[] {
  if (filter === "UNREPORTED") return items.filter((a) => a.status === "BELUM_LAPOR");
  if (filter === "LATE") return items.filter((a) => a.status === "TERLAMBAT");
  if (filter === "OVERDUE_GT_3_DAYS") return items.filter((a) => a.isOverdueMoreThan3Days);
  return items;
}

/** Menghitung metrik kartu KPI dashboard monitoring (BR-22). */
function buildKpiMetrics(
  totalProjects: number,
  items: DashboardAreaStatusItem[],
): DashboardKpiMetrics {
  return {
    totalProjects,
    activeAreas: items.length,
    reportsSubmittedToday: items.filter(
      (a) => a.status === "TERKIRIM" || a.status === "TERLAMBAT",
    ).length,
    areasOverdueMoreThan3Days: items.filter((a) => a.isOverdueMoreThan3Days).length,
  };
}

export class DashboardService {
  /** Mengambil ringkasan metrik dan daftar status area harian (US-12, BR-11, BR-22). */
  static async getSummary(
    query: DashboardSummaryQuery,
    now = new Date(),
  ): Promise<DashboardSummaryResponse> {
    const targetDate = query.date ?? toBusinessDateString(now, "Asia/Jakarta");
    const [totalProjects, rawAreas] = await Promise.all([
      DashboardRepository.countActiveProjects(query.projectId),
      DashboardRepository.findActiveAreasWithDetails(query.projectId),
    ]);

    const evaluatedItems = rawAreas.map((area) => evaluateAreaItem(area, targetDate));
    const metrics = buildKpiMetrics(totalProjects, evaluatedItems);
    const filteredAreas = filterAreaList(evaluatedItems, query.statusFilter ?? "ALL");

    return {
      metrics,
      targetDate,
      areas: filteredAreas,
    };
  }

  /** Mengelompokkan laporan terkirim untuk statistik keterlambatan per supervisor (BR-21). */
  static async getSupervisorLateness(
    query: SupervisorLatenessQuery,
  ): Promise<SupervisorLatenessItem[]> {
    const reports = await DashboardRepository.findSubmittedReportsForLateness({
      projectId: query.projectId,
      dateFrom: query.dateFrom ? parseDateOnlyUtc(query.dateFrom) : undefined,
      dateTo: query.dateTo ? parseDateOnlyUtc(query.dateTo) : undefined,
    });

    const groups = new Map<string, { name: string; username: string; total: number; late: number }>();
    for (const r of reports) {
      const spv = r.supervisor;
      const current = groups.get(spv.id) ?? {
        name: spv.name,
        username: spv.username,
        total: 0,
        late: 0,
      };
      current.total += 1;
      if (r.isLate) current.late += 1;
      groups.set(spv.id, current);
    }

    return Array.from(groups.entries())
      .map(([supervisorId, data]) => {
        const onTime = data.total - data.late;
        const rate = data.total > 0 ? Math.round((onTime / data.total) * 100) : 100;
        return {
          supervisorId,
          supervisorName: data.name,
          supervisorUsername: data.username,
          totalReports: data.total,
          onTimeCount: onTime,
          lateCount: data.late,
          onTimePercentage: rate,
        };
      })
      .sort((a, b) => b.lateCount - a.lateCount || a.supervisorName.localeCompare(b.supervisorName));
  }
}
