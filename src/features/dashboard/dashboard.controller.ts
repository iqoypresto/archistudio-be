import type { Request, Response } from "express";
import { ResponseHelper } from "../../helpers/response.helper.js";
import { validate } from "../../validations/validate.js";
import { DashboardService } from "./dashboard.service.js";
import {
  dashboardSummaryQuerySchema,
  supervisorLatenessQuerySchema,
} from "./dashboard.validation.js";

export class DashboardController {
  /** Handler untuk mengambil ringkasan metrik dan daftar status area dashboard. */
  static async getSummary(req: Request, res: Response) {
    const query = validate(dashboardSummaryQuerySchema, req.query);
    const result = await DashboardService.getSummary(query, new Date(), req.user?.role);
    ResponseHelper.ok(res, "Data ringkasan dashboard berhasil diambil", result);
  }

  /** Handler untuk rekapitulasi keterlambatan per supervisor. */
  static async getSupervisorLateness(req: Request, res: Response) {
    const query = validate(supervisorLatenessQuerySchema, req.query);
    const result = await DashboardService.getSupervisorLateness(query);
    ResponseHelper.ok(res, "Rekap keterlambatan supervisor berhasil diambil", result);
  }
}
