import type { Request, Response } from "express";
import { validate } from "../../validations/validate.js";
import { PdfExportService } from "./pdf-export.service.js";
import { exportDailyReportPdfQuerySchema } from "./pdf-export.validation.js";

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
}
