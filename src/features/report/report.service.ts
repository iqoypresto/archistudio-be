import { Prisma, ProjectStatus, ReportStatus, Role } from "@prisma/client";
import type { AuthenticatedUser } from "../../types/express.js";
import { ResponseError } from "../../utils/errors/response-error.util.js";
import { ReportRepository } from "./report.repository.js";
import { ReportReadService } from "./report-read.service.js";
import { enrichReportPhotoMetadata } from "./report.metadata.js";
import {
  buildMergedCompletenessInput,
  extractMutationFields,
  hydrateReportDetail,
} from "./report.guard.js";
import {
  assertSubmitCompleteness,
  assertValidStorageKeys,
  buildRevisionSnapshotJson,
} from "./report.helper.js";
import type { DailyReportDetail, ListReportsQuery, ReviseReportBody } from "./report.type.js";

export class ReportService {
  /** Mengambil daftar laporan terkirim berpaginasi sesuai cakupan role (BR-03). */
  static async listReports(query: ListReportsQuery, user: AuthenticatedUser) {
    return ReportReadService.list(query, user);
  }

  /** Detail laporan historis tetap tersedia sesuai scope pengguna (BR-03, BR-25). */
  static async getReportById(reportId: string, user: AuthenticatedUser): Promise<DailyReportDetail> {
    return ReportReadService.detail(reportId, user);
  }

  /** Merevisi laporan terkirim khusus OWNER dan menyimpan snapshot sebelum perubahan. */
  static async reviseReport(reportId: string, body: ReviseReportBody, user: AuthenticatedUser, now = new Date()) {
    if (user.role !== Role.OWNER) throw new ResponseError("REPORT_LOCKED_AFTER_SUBMIT");
    const existing = await ReportRepository.findReportDetailById(reportId);
    if (!existing) throw new ResponseError("RESOURCE_NOT_FOUND");
    if (existing.status !== ReportStatus.SUBMITTED) {
      throw new ResponseError("VALIDATION_ERROR", "Hanya laporan terkirim yang dapat direvisi oleh Owner.");
    }
    if (
      existing.area.project.status === ProjectStatus.SELESAI ||
      existing.area.project.archivedAt != null
    ) {
      throw new ResponseError(
        "PROJECT_ALREADY_COMPLETED",
        "Project sudah selesai atau diarsipkan sehingga laporan bersifat baca saja hingga dipulihkan oleh Owner.",
      );
    }
    if (body.photos) assertValidStorageKeys(body.photos, existing.area.project.id, existing.area.id);
    const photos = await enrichReportPhotoMetadata(body.photos, existing.area.project.timezone);
    const complete = buildMergedCompletenessInput(existing, body);
    assertSubmitCompleteness(complete);
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
