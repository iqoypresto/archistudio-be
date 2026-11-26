import type { Request, Response } from "express";
import { COMMON_MESSAGES } from "../../constants/message.constant.js";
import { ResponseHelper } from "../../helpers/response.helper.js";
import { validate } from "../../validations/validate.js";
import { PdfExportService } from "./pdf-export.service.js";
import { exportDailyReportPdfQuerySchema, exportDailyReportRangePdfQuerySchema, exportMonthlyReportPdfQuerySchema } from "./pdf-export.validation.js";
import { PdfExportPeriodService } from "./pdf-export-period.service.js";
import { ResponseError } from "../../utils/errors/response-error.util.js";

function sendPdf(res: Response, file: { filename: string; buffer: Buffer } | null) {
  if (!file) throw new ResponseError("RESOURCE_NOT_FOUND");
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${file.filename}"`);
  res.setHeader("Content-Length", file.buffer.length);
  res.end(file.buffer);
}

export class PdfExportController {
  /** Handler untuk export PDF Laporan Harian Opsi A on-demand (US-15, BR-29). */
  static async exportDailyReportPdf(req: Request, res: Response) {
    const query = validate(exportDailyReportPdfQuerySchema, req.query);
    const { filename, buffer } = await PdfExportService.generateDailyReportPdf(
      query.projectId,
      query.date,
    );

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", buffer.length);
    res.end(buffer);
  }

  static async exportMonthlyReportPdf(req: Request, res: Response) {
    const query = validate(exportMonthlyReportPdfQuerySchema, req.query);
    sendPdf(res, await PdfExportPeriodService.monthly(query.projectId, query.month));
  }

  static async getMonthlyReportSummary(req: Request, res: Response) {
    const query = validate(exportMonthlyReportPdfQuerySchema, req.query);
    const summary = await PdfExportPeriodService.monthlySummary(query.projectId, query.month);
    if (!summary) throw new ResponseError("RESOURCE_NOT_FOUND");
    ResponseHelper.ok(res, COMMON_MESSAGES.FETCHED, summary);
  }

  static async exportDailyReportRangePdf(req: Request, res: Response) {
    const query = validate(exportDailyReportRangePdfQuerySchema, req.query);
    sendPdf(res, await PdfExportPeriodService.dailyRange(query.projectId, query.fromDate, query.toDate));
  }
}
