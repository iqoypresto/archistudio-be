import { ReportStatus, Role } from "@prisma/client";
import { isPastCutoff, parseDateOnlyUtc } from "../../helpers/date.helper.js";
import { PaginationHelper } from "../../helpers/pagination.helper.js";
import type { AuthenticatedUser } from "../../types/express.js";
import { ResponseError } from "../../utils/errors/response-error.util.js";
import {
  assertAssignmentOnDate,
  assertProgressiveUnlock,
  buildReportsWhere,
  extractMutationFields,
  hydrateReportDetail,
} from "./report.guard.js";
import {
  assertSubmitCompleteness,
  assertValidStorageKeys,
  buildReportNumber,
  mapReportListItem,
  toIsoDateOnly,
} from "./report.helper.js";
import { ReportRepository } from "./report.repository.js";
import type {
  DailyReportDetail,
  ListReportsQuery,
  SaveDraftBody,
  SubmitReportBody,
  UpdateDraftBody,
} from "./report.type.js";

export class ReportService {
  /** Mengambil daftar laporan harian berpaginasi sesuai cakupan role (BR-03). */
  static async listReports(query: ListReportsQuery, user: AuthenticatedUser) {
    const { page, pageSize, skip, take } = PaginationHelper.getSkipTake(
      query.page,
      query.pageSize,
    );
    const [rows, totalItems] = await ReportRepository.findReportsPaginated({
      where: buildReportsWhere(query, user),
      skip,
      take,
      orderBy: { [query.sortBy]: query.sortOrder },
    });
    return {
      items: rows.map(mapReportListItem),
      meta: PaginationHelper.buildMeta(page, pageSize, totalItems),
    };
  }

  /** Mengambil detail penuh satu laporan beserta signed photo URLs (US-13, BR-03, BR-28). */
  static async getReportById(
    reportId: string,
    user: AuthenticatedUser,
  ): Promise<DailyReportDetail> {
    const record = await ReportRepository.findReportDetailById(reportId);
    if (!record) throw new ResponseError("RESOURCE_NOT_FOUND");
    if (user.role === Role.SUPERVISOR) {
      const allowed =
        record.supervisorId === user.id ||
        record.area.assignments.some((a) => a.supervisorId === user.id);
      if (!allowed) throw new ResponseError("AREA_SCOPE_FORBIDDEN");
    }
    return hydrateReportDetail(record);
  }

  /** Menyimpan atau memperbarui draf laporan harian (US-08, US-09, BR-17, BR-20). */
  static async saveDraft(
    body: SaveDraftBody,
    user: AuthenticatedUser,
    now = new Date(),
  ): Promise<DailyReportDetail> {
    const area = await ReportRepository.findAreaContextForDraft(body.areaId);
    if (!area) throw new ResponseError("RESOURCE_NOT_FOUND");
    const assignment = assertAssignmentOnDate(area.assignments, user.id, body.reportDate);
    const existing = area.reports.find((r) => toIsoDateOnly(r.reportDate) === body.reportDate);
    if (existing?.status === ReportStatus.SUBMITTED) {
      throw new ResponseError("REPORT_ALREADY_EXISTS");
    }
    assertProgressiveUnlock({
      projectStartDate: area.project.startDate,
      projectEndDate: area.project.endDate,
      assignmentStartDate: assignment.startDate,
      assignmentEndDate: assignment.endDate,
      timezone: area.project.timezone,
      routineHolidays: area.project.routineHolidays,
      submittedDates: area.reports
        .filter((r) => r.status === ReportStatus.SUBMITTED)
        .map((r) => toIsoDateOnly(r.reportDate)),
      unlockedThroughDate: area.unlocks[0]?.unlockedThroughDate ?? null,
      targetReportDate: body.reportDate,
      now,
    });
    assertValidStorageKeys(body.photos ?? [], area.project.id, area.id);
    if (existing) {
      const updated = await ReportRepository.updateDraftReport({
        reportId: existing.id,
        uploadedById: user.id,
        data: extractMutationFields(body),
        photos: body.photos,
      });
      return hydrateReportDetail(updated);
    }
    const created = await ReportRepository.createDraftReport({
      reportNumber: buildReportNumber(area.project.code, area.code, body.reportDate),
      areaId: area.id,
      supervisorId: user.id,
      reportDate: parseDateOnlyUtc(body.reportDate),
      data: extractMutationFields(body),
      photos: body.photos ?? [],
    });
    return hydrateReportDetail(created);
  }

  /** Memperbarui isi draf laporan yang sudah ada (BR-17, BR-24). */
  static async updateDraft(
    reportId: string,
    body: UpdateDraftBody,
    user: AuthenticatedUser,
  ): Promise<DailyReportDetail> {
    const existing = await ReportRepository.findReportDetailById(reportId);
    if (!existing) throw new ResponseError("RESOURCE_NOT_FOUND");
    if (existing.supervisorId !== user.id) throw new ResponseError("AREA_SCOPE_FORBIDDEN");
    if (existing.status === ReportStatus.SUBMITTED) {
      throw new ResponseError("REPORT_LOCKED_AFTER_SUBMIT");
    }
    if (body.photos) {
      assertValidStorageKeys(body.photos, existing.area.project.id, existing.area.id);
    }
    const updated = await ReportRepository.updateDraftReport({
      reportId,
      uploadedById: user.id,
      data: extractMutationFields(body),
      photos: body.photos,
    });
    return hydrateReportDetail(updated);
  }

  /** Mengirim laporan harian + paraf otomatis + evaluasi cutoff 17:00 (BR-13..BR-21, BR-26). */
  static async submitReport(
    reportId: string,
    body: SubmitReportBody,
    user: AuthenticatedUser,
    now = new Date(),
  ): Promise<DailyReportDetail> {
    const existing = await ReportRepository.findReportDetailById(reportId);
    if (!existing) throw new ResponseError("RESOURCE_NOT_FOUND");
    if (existing.supervisorId !== user.id) throw new ResponseError("AREA_SCOPE_FORBIDDEN");
    if (existing.status === ReportStatus.SUBMITTED) {
      throw new ResponseError("REPORT_ALREADY_EXISTS");
    }
    const reportDateStr = toIsoDateOnly(existing.reportDate);
    const assignment = assertAssignmentOnDate(existing.area.assignments, user.id, reportDateStr);
    assertProgressiveUnlock({
      projectStartDate: existing.area.project.startDate,
      projectEndDate: existing.area.project.endDate,
      assignmentStartDate: assignment.startDate,
      assignmentEndDate: assignment.endDate,
      timezone: existing.area.project.timezone,
      routineHolidays: existing.area.project.routineHolidays,
      submittedDates: existing.area.reports.map((r) => toIsoDateOnly(r.reportDate)),
      unlockedThroughDate: existing.area.unlocks[0]?.unlockedThroughDate ?? null,
      targetReportDate: reportDateStr,
      now,
    });
    if (body.photos) {
      assertValidStorageKeys(body.photos, existing.area.project.id, existing.area.id);
    }
    assertSubmitCompleteness({
      reportType: body.reportType ?? existing.reportType,
      progressText: body.progressText !== undefined ? body.progressText : existing.progressText,
      obstaclesText: body.obstaclesText !== undefined ? body.obstaclesText : existing.obstaclesText,
      tomorrowPlanText:
        body.tomorrowPlanText !== undefined ? body.tomorrowPlanText : existing.tomorrowPlanText,
      weather: body.weather !== undefined ? body.weather : existing.weather,
      workerCount: body.workerCount !== undefined ? body.workerCount : existing.workerCount,
      noWorkReason: body.noWorkReason !== undefined ? body.noWorkReason : existing.noWorkReason,
      photosCount: body.photos ? body.photos.length : existing.photos.length,
    });
    const submitted = await ReportRepository.submitReportTransaction({
      reportId,
      uploadedById: user.id,
      data: extractMutationFields(body),
      photos: body.photos,
      submittedAt: now,
      isLate: isPastCutoff(now, reportDateStr, existing.area.project.timezone, 17),
      signedByName: user.name,
      signedByTitle: user.jobTitle,
    });
    return hydrateReportDetail(submitted);
  }
}
