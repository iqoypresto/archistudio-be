import type { Request, Response } from "express";
import { COMMON_MESSAGES } from "../../constants/message.constant.js";
import { ResponseHelper } from "../../helpers/response.helper.js";
import { ResponseError } from "../../utils/errors/response-error.util.js";
import { ReportLockService } from "./report-lock.service.js";

export class ReportController {
  /** Mengembalikan status tugas harian & kunci bertahap area milik supervisor (US-07, US-10). */
  static async getMyAreasStatus(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new ResponseError("AUTHENTICATION_REQUIRED");
    const result = await ReportLockService.getMyAreasStatus(req.user.id);
    ResponseHelper.ok(res, COMMON_MESSAGES.FETCHED, result);
  }
}
