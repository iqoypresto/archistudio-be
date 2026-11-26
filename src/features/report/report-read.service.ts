import { Role } from "@prisma/client";
import { PaginationHelper } from "../../helpers/pagination.helper.js";
import type { AuthenticatedUser } from "../../types/express.js";
import { ResponseError } from "../../utils/errors/response-error.util.js";
import { ReportArchiveService } from "./report-archive.service.js";
import { archiveTimestamp } from "./report-archive.helper.js";
import { assertCanReadReport, buildReportsWhere, hydrateReportDetail } from "./report.guard.js";
import { mapReportListItem } from "./report.helper.js";
import { ReportRepository } from "./report.repository.js";
import type { ListReportsQuery } from "./report.type.js";

export class ReportReadService {
  static async list(query: ListReportsQuery, user: AuthenticatedUser, archive = false) {
    if (archive && user.role !== Role.OWNER && user.role !== Role.ADMIN) {
      throw new ResponseError("FORBIDDEN");
    }
    const scope = buildReportsWhere(query, user);
    await ReportArchiveService.process(scope);
    const where = archive || query.archiveState === "archived"
      ? { AND: [scope, { archivedAt: { not: null }, status: "SUBMITTED" as const }] }
      : query.archiveState === "active"
        ? { AND: [scope, { archivedAt: null, status: "SUBMITTED" as const }] }
        : scope;
    const { page, pageSize, skip, take } = PaginationHelper.getSkipTake(query.page, query.pageSize);
    const [rows, totalItems] = await ReportRepository.findReportsPaginated({
      where, skip, take, orderBy: { [query.sortBy]: query.sortOrder },
    });
    return { items: rows.map(mapReportListItem), meta: PaginationHelper.buildMeta(page, pageSize, totalItems) };
  }

  static async detail(reportId: string, user: AuthenticatedUser, now = new Date()) {
    const record = await ReportRepository.findReportDetailById(reportId);
    if (!record) throw new ResponseError("RESOURCE_NOT_FOUND");
    assertCanReadReport(record, user);
    if (record.status === "SUBMITTED" && !record.archivedAt &&
        archiveTimestamp(record.reportDate, record.area.project.timezone, now)) {
      await ReportArchiveService.process({ id: record.id }, now);
      const archived = await ReportRepository.findReportDetailById(reportId);
      if (!archived) throw new ResponseError("RESOURCE_NOT_FOUND");
      return hydrateReportDetail(archived);
    }
    return hydrateReportDetail(record);
  }
}
