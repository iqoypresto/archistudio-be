import { Prisma, ReportStatus, StoragePurpose, StorageTargetType, StoredFileStatus, UploadSessionPhotoStatus } from "@prisma/client";
import { isPastCutoff, parseDateOnlyUtc } from "../../helpers/date.helper.js";
import type { AuthenticatedUser } from "../../types/express.js";
import { ResponseError } from "../../utils/errors/response-error.util.js";
import { archiveTimestamp } from "./report-archive.helper.js";
import { assertAreaDateUnlocked, assertAssignmentOnDate, extractMutationFields, hydrateReportDetail } from "./report.guard.js";
import { assertSubmitCompleteness, buildReportNumber, toIsoDateOnly } from "./report.helper.js";
import { enrichReportPhotoMetadata } from "./report.metadata.js";
import { ReportRepository } from "./report.repository.js";
import type { SubmitNewBody } from "./report.type.js";
import { ReportUploadSessionRepository } from "./report-upload-session.repository.js";

export class ReportDirectService {
  static async submit(body: SubmitNewBody, user: AuthenticatedUser) {
    const area = await ReportRepository.findAreaContextForSubmit(body.areaId);
    if (!area) throw new ResponseError("RESOURCE_NOT_FOUND");
    const existing = area.reports.find((report) => toIsoDateOnly(report.reportDate) === body.reportDate);
    if (existing?.status === ReportStatus.SUBMITTED && existing.supervisorId === user.id) {
      const prior = await ReportRepository.findReportDetailById(existing.id);
      if (prior) return hydrateReportDetail(prior);
    }
    if (existing) throw new ResponseError("REPORT_ALREADY_EXISTS");
    const assignment = assertAssignmentOnDate(area.assignments, user.id, body.reportDate);
    assertAreaDateUnlocked({
      project: area.project, assignment,
      submittedDates: area.reports.filter((report) => report.status === ReportStatus.SUBMITTED)
        .map((report) => toIsoDateOnly(report.reportDate)),
      unlocks: area.unlocks, targetReportDate: body.reportDate, now: new Date(),
    });
    assertSubmitCompleteness({ ...body, photosCount: body.photos.length });
    const claimed = await ReportUploadSessionRepository.claimForFinalizing(body.sessionId, user.id, new Date());
    if (!claimed) throw new ResponseError("AREA_SCOPE_FORBIDDEN");
    const session = await ReportUploadSessionRepository.findOwned(body.sessionId, user.id);
    if (!session || session.areaId !== area.id || toIsoDateOnly(session.reportDate) !== body.reportDate) {
      throw new ResponseError("AREA_SCOPE_FORBIDDEN");
    }
    const readyFileIds = new Set(session.photos.filter((item) => item.status === UploadSessionPhotoStatus.PENDING &&
      item.storedFile.status === StoredFileStatus.READY && item.storedFile.uploadedById === user.id &&
      item.storedFile.purpose === StoragePurpose.REPORT_PHOTO &&
      item.storedFile.targetType === StorageTargetType.REPORT_UPLOAD_SESSION && item.storedFile.targetId === body.sessionId)
      .map((item) => item.storedFileId));
    if (body.photos.some((photo) => !readyFileIds.has(photo.storedFileId))) {
      throw new ResponseError("INVALID_FILE_REFERENCE");
    }
    const photos = await enrichReportPhotoMetadata(body.photos, area.project.timezone);
    const submittedAt = new Date();
    try {
      const created = await ReportUploadSessionRepository.finalizeAndCreateReport({
        sessionId: body.sessionId,
        report: {
        reportNumber: buildReportNumber(area.project.code, area.code, body.reportDate),
        areaId: area.id, supervisorId: user.id,
        reportDate: parseDateOnlyUtc(body.reportDate),
        data: extractMutationFields(body), photos: photos ?? [], submittedAt,
        archivedAt: archiveTimestamp(parseDateOnlyUtc(body.reportDate), area.project.timezone, submittedAt),
        isLate: isPastCutoff(submittedAt, body.reportDate, area.project.timezone, 17),
        signedByName: user.name, signedByTitle: user.jobTitle,
        },
      });
      if (!created) throw new ResponseError("INVALID_FILE_REFERENCE");
      return hydrateReportDetail(created);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ResponseError("REPORT_ALREADY_EXISTS");
      }
      throw error;
    }
  }
}
