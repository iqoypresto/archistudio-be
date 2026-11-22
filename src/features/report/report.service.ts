import { Prisma, ReportStatus, Role } from "@prisma/client";
import { isPastCutoff, parseDateOnlyUtc } from "../../helpers/date.helper.js";
import { ReportReadService } from "./report-read.service.js";
import { archiveTimestamp } from "./report-archive.helper.js";
import type { AuthenticatedUser } from "../../types/express.js";
import { ResponseError } from "../../utils/errors/response-error.util.js";
import {
  assertAreaDateUnlocked,
  assertAssignmentOnDate,
  buildMergedCompletenessInput,
  extractMutationFields,
  hydrateReportDetail,
} from "./report.guard.js";
import {
  assertSubmitCompleteness,
  assertValidStorageKeys,
  buildReportNumber,
  buildRevisionSnapshotJson,
  toIsoDateOnly,
} from "./report.helper.js";
import { ReportRepository } from "./report.repository.js";
import { enrichReportPhotoMetadata, mapStoredReportPhotos } from "./report.metadata.js";
import type {
  DailyReportDetail,
  ListReportsQuery,
  ReviseReportBody,
  SaveDraftBody,
  SubmitReportBody,
  UpdateDraftBody,
} from "./report.type.js";
import { ReportUploadSessionRepository } from "./report-upload-session.repository.js";

export class ReportService {
  /** Mengambil daftar laporan harian berpaginasi sesuai cakupan role (BR-03). */
  static async listReports(query: ListReportsQuery, user: AuthenticatedUser) {
    return ReportReadService.list(query, user);
  }

  /** Detail historis tetap tersedia sesuai scope pengguna (BR-03, BR-25). */
  static async getReportById(reportId: string, user: AuthenticatedUser): Promise<DailyReportDetail> {
    return ReportReadService.detail(reportId, user);
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
    assertAreaDateUnlocked({
      project: area.project,
      assignment,
      submittedDates: area.reports
        .filter((r) => r.status === ReportStatus.SUBMITTED)
        .map((r) => toIsoDateOnly(r.reportDate)),
      unlocks: area.unlocks,
      targetReportDate: body.reportDate,
      now,
    });
    assertValidStorageKeys(body.photos ?? [], area.project.id, area.id);
    const photos = await enrichReportPhotoMetadata(body.photos, area.project.timezone);
    if (existing) {
      const updated = await ReportRepository.updateDraftReport({
        reportId: existing.id,
        uploadedById: user.id,
        data: extractMutationFields(body),
        photos,
      });
      return hydrateReportDetail(updated);
    }
    const created = await ReportRepository.createDraftReport({
      reportNumber: buildReportNumber(area.project.code, area.code, body.reportDate),
      areaId: area.id,
      supervisorId: user.id,
      reportDate: parseDateOnlyUtc(body.reportDate),
      data: extractMutationFields(body),
      photos: photos ?? [],
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
    const photos = await enrichReportPhotoMetadata(body.photos, existing.area.project.timezone);
    const updated = await ReportRepository.updateDraftReport({
      reportId,
      uploadedById: user.id,
      data: extractMutationFields(body),
      photos,
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
    if (body.sessionId) {
      const claimed = await ReportUploadSessionRepository.claimForFinalizing(body.sessionId, user.id, now);
      const session = claimed ? await ReportUploadSessionRepository.findOwned(body.sessionId, user.id) : null;
      if (!session || session.areaId !== existing.area.id || toIsoDateOnly(session.reportDate) !== reportDateStr) {
        throw new ResponseError("AREA_SCOPE_FORBIDDEN");
      }
      const expectedPrefix = `projects/${existing.area.project.id}/areas/${existing.area.id}/${reportDateStr}/${user.id}/${body.sessionId}/`;
      if ((body.photos ?? []).some((photo) => {
        const sessionPhoto = session.photos.find((item) => item.storageKey === photo.storageKey);
        return !sessionPhoto || (sessionPhoto.status === "PENDING" && !photo.storageKey.startsWith(expectedPrefix));
      })) {
        throw new ResponseError("INVALID_STORAGE_KEY");
      }
    }
    assertAreaDateUnlocked({
      project: existing.area.project,
      assignment,
      submittedDates: existing.area.reports.map((r) => toIsoDateOnly(r.reportDate)),
      unlocks: existing.area.unlocks,
      targetReportDate: reportDateStr,
      now,
    });
    assertSubmitCompleteness(buildMergedCompletenessInput(existing, body));
    const photosToPersist = body.photos ?? mapStoredReportPhotos(existing.photos);
    assertValidStorageKeys(photosToPersist, existing.area.project.id, existing.area.id);
    const photos = await enrichReportPhotoMetadata(photosToPersist, existing.area.project.timezone);
    const submitted = await ReportRepository.submitReportTransaction({
      reportId,
      uploadedById: user.id,
      data: extractMutationFields(body),
      photos,
      submittedAt: now,
      archivedAt: archiveTimestamp(existing.reportDate, existing.area.project.timezone, now),
      isLate: isPastCutoff(now, reportDateStr, existing.area.project.timezone, 17),
      signedByName: user.name,
      signedByTitle: user.jobTitle,
      sessionId: body.sessionId,
    });
    return hydrateReportDetail(submitted);
  }

  /** Merevisi laporan terkirim (khusus OWNER) dan menyimpan snapshot JSON versi lama (ADR-05, BR-24). */
  static async reviseReport(
    reportId: string,
    body: ReviseReportBody,
    user: AuthenticatedUser,
    now = new Date(),
  ): Promise<DailyReportDetail> {
    if (user.role !== Role.OWNER) throw new ResponseError("REPORT_LOCKED_AFTER_SUBMIT");
    const existing = await ReportRepository.findReportDetailById(reportId);
    if (!existing) throw new ResponseError("RESOURCE_NOT_FOUND");
    if (existing.status !== ReportStatus.SUBMITTED) {
      throw new ResponseError(
        "VALIDATION_ERROR",
        "Hanya laporan berstatus TERKIRIM yang dapat direvisi oleh Owner.",
      );
    }
    if (body.photos) {
      assertValidStorageKeys(body.photos, existing.area.project.id, existing.area.id);
    }
    const photos = await enrichReportPhotoMetadata(body.photos, existing.area.project.timezone);
    assertSubmitCompleteness(buildMergedCompletenessInput(existing, body));
    const snapshot = buildRevisionSnapshotJson(existing) as unknown as Prisma.InputJsonValue;
    const revised = await ReportRepository.reviseReportTransaction({
      reportId,
      revisedById: user.id,
      revisionNo: existing.revisionNo + 1,
      changeSummary: body.changeSummary,
      previousSnapshotJson: snapshot,
      data: extractMutationFields(body),
      photos,
      revisedAt: now,
    });
    return hydrateReportDetail(revised);
  }
}
