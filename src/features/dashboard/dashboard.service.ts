import { ReportStatus, Role } from "@prisma/client";
import {
  isRestDay,
  parseDateOnlyUtc,
  toBusinessDateString,
} from "../../helpers/date.helper.js";
import { DashboardRepository } from "./dashboard.repository.js";
import { evaluateAreaLock } from "../report/report-lock.helper.js";
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

/** Mengecek apakah tanggal target berada di luar jadwal efektif proyek/penugasan. */
function isOutsideSchedule(
  targetDate: string,
  projectStart: Date,
  projectEnd: Date | null,
  assignmentStart?: Date,
): boolean {
  const startStr = toDateStr(projectStart);
  const endStr = projectEnd ? toDateStr(projectEnd) : null;
  if (targetDate < startStr) return true;
  if (endStr && targetDate > endStr) return true;
  if (assignmentStart && targetDate < toDateStr(assignmentStart)) return true;
  return false;
}

/** Menentukan status harian laporan pada tanggal target (BR-11, BR-18, BR-21). */
function resolveAreaDailyStatus(params: {
  targetReport: AreaDetailRecord["reports"][number] | undefined;
  targetDate: string;
  routineHolidays: number[];
  hasAssignment: boolean;
  outsideSchedule: boolean;
}): AreaDailyStatusType {
  if (params.targetReport && params.targetReport.status === ReportStatus.SUBMITTED) {
    return params.targetReport.isLate ? "TERLAMBAT" : "TERKIRIM";
  }
  if (!params.hasAssignment) return "BELUM_DITUGASKAN";
  if (params.outsideSchedule) return "DI_LUAR_JADWAL";
  if (isRestDay(params.targetDate, params.routineHolidays)) return "LIBUR_RUTIN";
  return "BELUM_LAPOR";
}

/** Menghitung evaluasi kunci dan status harian untuk satu record area. */
function evaluateAreaItem(
  area: AreaDetailRecord,
  explicitDate: string | undefined,
  now: Date,
): DashboardAreaStatusItem {
  const effectiveDate = explicitDate ?? toBusinessDateString(now, area.project.timezone);
  const assignment = area.assignments[0];
  const latestUnlock = area.unlocks[0];
  const outsideSchedule = isOutsideSchedule(
    effectiveDate,
    area.project.startDate,
    area.project.endDate,
    assignment?.startDate,
  );

  const lockEvaluation = assignment
    ? evaluateAreaLock({
        projectStartDate: area.project.startDate,
        projectEndDate: area.project.endDate,
        assignmentStartDate: assignment.startDate,
        assignmentEndDate: assignment.endDate,
        todayDate: effectiveDate,
        routineHolidays: area.project.routineHolidays,
        reports: area.reports,
        unlockedThroughDate: latestUnlock?.unlockedThroughDate ?? null,
      }).lockState
    : {
        overdueBusinessDaysCount: 0,
        isOverdueMoreThan3Days: false,
        oldestOverdueDate: null,
      };

  const targetReport = area.reports.find(
    (r) => toDateStr(r.reportDate) === effectiveDate && r.status === ReportStatus.SUBMITTED,
  );
  const status = resolveAreaDailyStatus({
    targetReport,
    targetDate: effectiveDate,
    routineHolidays: area.project.routineHolidays,
    hasAssignment: Boolean(assignment),
    outsideSchedule,
  });

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
    overdueBusinessDaysCount: lockEvaluation.overdueBusinessDaysCount,
    isOverdueMoreThan3Days: lockEvaluation.isOverdueMoreThan3Days,
    oldestOverdueDate: lockEvaluation.oldestOverdueDate,
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
  /** Mengambil ringkasan metrik, visibilitas sistem, dan daftar status area harian (US-12). */
  static async getSummary(
    query: DashboardSummaryQuery,
    now = new Date(),
    actorRole?: Role,
  ): Promise<DashboardSummaryResponse> {
    const targetDate = query.date ?? toBusinessDateString(now, "Asia/Jakarta");
    const [totalProjects, rawAreas, systemOverview] = await Promise.all([
      DashboardRepository.countActiveProjects(query.projectId),
      DashboardRepository.findActiveAreasWithDetails(query.projectId),
      actorRole
        ? DashboardRepository.getSystemOverview(actorRole === Role.OWNER, now)
        : Promise.resolve(undefined),
    ]);

    const evaluatedItems = rawAreas.map((area) => evaluateAreaItem(area, query.date, now));
    const metrics = buildKpiMetrics(totalProjects, evaluatedItems);
    const filteredAreas = filterAreaList(evaluatedItems, query.statusFilter ?? "ALL");

    return {
      metrics,
      targetDate,
      areas: filteredAreas,
      ...(systemOverview ? { systemOverview } : {}),
    };
  }

  /** Mengelompokkan laporan terkirim untuk statistik keterlambatan per pengawas (BR-21). */
  static async getSupervisorLateness(
    query: SupervisorLatenessQuery,
  ): Promise<SupervisorLatenessItem[]> {
    const reports = await DashboardRepository.findSubmittedReportsForLateness({
      projectId: query.projectId,
      dateFrom: query.dateFrom ? parseDateOnlyUtc(query.dateFrom) : undefined,
      dateTo: query.dateTo ? parseDateOnlyUtc(query.dateTo) : undefined,
    });

    const groups = new Map<
      string,
      { name: string; username: string; role?: Role; jobTitle?: string; total: number; late: number }
    >();
    for (const r of reports) {
      const spv = r.supervisor;
      const current = groups.get(spv.id) ?? {
        name: spv.name,
        username: spv.username,
        role: spv.role,
        jobTitle: spv.jobTitle,
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
          ...(data.role ? { supervisorRole: data.role } : {}),
          ...(data.jobTitle ? { supervisorJobTitle: data.jobTitle } : {}),
          totalReports: data.total,
          onTimeCount: onTime,
          lateCount: data.late,
          onTimePercentage: rate,
        };
      })
      .sort((a, b) => b.lateCount - a.lateCount || a.supervisorName.localeCompare(b.supervisorName));
  }
}
