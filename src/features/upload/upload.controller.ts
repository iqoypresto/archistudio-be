import type { Request, Response } from "express";
import { COMMON_MESSAGES } from "../../constants/message.constant.js";
import { ResponseHelper } from "../../helpers/response.helper.js";
import { ResponseError } from "../../utils/errors/response-error.util.js";
import { validate } from "../../validations/validate.js";
import { UploadService } from "./upload.service.js";
import { UploadValidation } from "./upload.validation.js";

export class UploadController {
  /** Menghasilkan presigned PUT URL R2 untuk unggah langsung foto laporan (US-08). */
  static async signUploadUrls(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new ResponseError("AUTHENTICATION_REQUIRED");
    const body = validate(UploadValidation.BODY.sign, req.body);
    const result = await UploadService.signUploadUrls(body, req.user);
    ResponseHelper.ok(res, COMMON_MESSAGES.CREATED, result);
  }

  /** Menghasilkan presigned GET URL berumur pendek untuk melihat foto laporan (US-13). */
  static async getReportViewUrls(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new ResponseError("AUTHENTICATION_REQUIRED");
    const body = validate(UploadValidation.BODY.viewUrls, req.body);
    const result = await UploadService.getReportViewUrls(body, req.user);
    ResponseHelper.ok(res, COMMON_MESSAGES.FETCHED, result);
  }
}
