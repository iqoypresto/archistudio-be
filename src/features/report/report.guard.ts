import { Prisma, Role } from "@prisma/client";
import {
  computeAreaLockState,
  parseDateOnlyUtc,
  toBusinessDateString,
} from "../../helpers/date.helper.js";
import type { AuthenticatedUser } from "../../types/express.js";
import { ResponseError } from "../../utils/errors/response-error.util.js";
import { createSignedViewUrlsMap } from "../../utils/storage/storage.adapter.js";
import { ReportLockService } from "./report-lock.service.js";
import { mapReportDetail, toIsoDateOnly } from "./report.helper.js";
import type { DraftMutationData, ReportDetailRecord } from "./report.prisma.js";
import type {
  DailyReportDetail,
  ListReportsQuery,
  UpdateDraftBody,
} from "./report.type.js";

/** Memastikan supervisor bertugas pada area dan tanggal target (BR-03, BR-10). */
export function assertAssignmentOnDate(
  assignments: { supervisorId: string; startDate: Date; endDate: Date | null }[],
  supervisorId: string,
  targetDate: string,
) {
  const own = assignments.filter((a) => a.supervisorId === supervisorId);
  if (own.length === 0) throw new ResponseError("AREA_SCOPE_FORBIDDEN");
  const matched = own.find((a) => {
    const start = toIsoDateOnly(a.startDate);
    const end = a.endDate ? toIsoDateOnly(a.endDate) : null;
    return targetDate >= start && (!end || targetDate <= end);
  });
  if (!matched) throw new ResponseError("ASSIGNMENT_ENDED");
  return matched;
}

/** Memvalidasi tidak ada tanggal tertunggak yang mengunci tanggal target (BR-20). */
export function assertProgressiveUnlock(params: {
  projectStartDate: Date;
  projectEndDate: Date | null;
  assignmentStartDate: Date;
  assignmentEndDate: Date | null;
  timezone: string;
  routineHolidays: number[];
  submittedDates: string[];
  unlockedThroughDate?: Date | null;
  targetReportDate: string;
  now: Date;
}): void {
  const lockState = computeAreaLockState({
    projectStartDate: toIsoDateOnly(params.projectStartDate),
    projectEndDate: params.projectEndDate ? toIsoDateOnly(params.projectEndDate) : null,
    assignmentStartDate: toIsoDateOnly(params.assignmentStartDate),
    assignmentEndDate: params.assignmentEndDate ? toIsoDateOnly(params.assignmentEndDate) : null,
    todayDate: toBusinessDateString(params.now, params.timezone),
    routineHolidays: params.routineHolidays,
    submittedDates: params.submittedDates,
    unlockedThroughDate: params.unlockedThroughDate
      ? toIsoDateOnly(params.unlockedThroughDate)
      : null,
  });
  ReportLockService.assertDateUnlocked(lockState.pendingDates, params.targetReportDate);
}

export function assertAreaDateUnlocked(params: {
  project: { startDate: Date; endDate: Date | null; timezone: string; routineHolidays: number[] };
  assignment: { startDate: Date; endDate: Date | null };
  submittedDates: string[];
  unlocks: { unlockedThroughDate: Date }[];
  targetReportDate: string;
  now: Date;
}): void {
  assertProgressiveUnlock({
    projectStartDate: params.project.startDate,
    projectEndDate: params.project.endDate,
    assignmentStartDate: params.assignment.startDate,
    assignmentEndDate: params.assignment.endDate,
    timezone: params.project.timezone,
    routineHolidays: params.project.routineHolidays,
    submittedDates: params.submittedDates,
    unlockedThroughDate: params.unlocks[0]?.unlockedThroughDate ?? null,
    targetReportDate: params.targetReportDate,
    now: params.now,
  });
}

export function extractMutationFields(body: UpdateDraftBody): DraftMutationData {
  return {
    reportType: body.reportType,
    progressText: body.progressText,
    obstaclesText: body.obstaclesText,
    tomorrowPlanText: body.tomorrowPlanText,
    weather: body.weather,
    workerCount: body.workerCount,
    noWorkReason: body.noWorkReason,
    locationText: body.locationText,
  };
}

export function buildReportsWhere(
  query: ListReportsQuery,
  user: AuthenticatedUser,
): Prisma.DailyReportWhereInput {
  const where: Prisma.DailyReportWhereInput = {
    archivedAt: null,
    area: {
      deletedAt: null,
      projectId: query.projectId,
      project: { deletedAt: null },
      assignments:
        user.role === Role.SUPERVISOR ? { some: { supervisorId: user.id } } : undefined,
    },
    areaId: query.areaId,
    supervisorId: query.supervisorId,
    status: query.status,
    reportType: query.reportType,
    isLate: query.isLate,
  };
  if (query.reportDate) {
    where.reportDate = parseDateOnlyUtc(query.reportDate);
  } else if (query.dateFrom || query.dateTo) {
    where.reportDate = {
      gte: query.dateFrom ? parseDateOnlyUtc(query.dateFrom) : undefined,
      lte: query.dateTo ? parseDateOnlyUtc(query.dateTo) : undefined,
    };
  }
  if (query.search) {
    where.OR = [
      { reportNumber: { contains: query.search, mode: "insensitive" } },
      { progressText: { contains: query.search, mode: "insensitive" } },
      { noWorkReason: { contains: query.search, mode: "insensitive" } },
    ];
  }
  return where;
}

export async function hydrateReportDetail(
  record: ReportDetailRecord,
): Promise<DailyReportDetail> {
  const keys = record.photos.map((p) => p.storageKey);
  const urlMap = keys.length > 0 ? await createSignedViewUrlsMap(keys) : {};
  return mapReportDetail(record, urlMap);
}

export function assertCanReadReport(
  record: ReportDetailRecord,
  user: AuthenticatedUser,
): void {
  if (user.role !== Role.SUPERVISOR) return;
  const allowed =
    record.supervisorId === user.id ||
    record.area.assignments.some((a) => a.supervisorId === user.id);
  if (!allowed) throw new ResponseError("AREA_SCOPE_FORBIDDEN");
}

export function buildMergedCompletenessInput(
  existing: ReportDetailRecord,
  body: UpdateDraftBody,
) {
  return {
    reportType: body.reportType ?? existing.reportType,
    progressText: body.progressText !== undefined ? body.progressText : existing.progressText,
    obstaclesText: body.obstaclesText !== undefined ? body.obstaclesText : existing.obstaclesText,
    tomorrowPlanText:
      body.tomorrowPlanText !== undefined ? body.tomorrowPlanText : existing.tomorrowPlanText,
    weather: body.weather !== undefined ? body.weather : existing.weather,
    workerCount: body.workerCount !== undefined ? body.workerCount : existing.workerCount,
    noWorkReason: body.noWorkReason !== undefined ? body.noWorkReason : existing.noWorkReason,
    photosCount: body.photos ? body.photos.length : existing.photos.length,
  };
}
