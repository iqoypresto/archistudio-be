import type { Request, Response } from "express";
import { COMMON_MESSAGES } from "../../constants/message.constant.js";
import { ResponseHelper } from "../../helpers/response.helper.js";
import type { AuthenticatedUser } from "../../types/express.js";
import { ResponseError } from "../../utils/errors/response-error.util.js";
import { validate } from "../../validations/validate.js";
import { UploadService } from "./upload.service.js";
import { UploadValidation } from "./upload.validation.js";

function authenticatedUser(req: Request): AuthenticatedUser {
  if (!req.user) throw new ResponseError("AUTHENTICATION_REQUIRED");
  return req.user;
}

function parseInitBody(raw: unknown) {
  if (typeof raw === "object" && raw !== null && "reportSessionId" in raw) {
    return validate(UploadValidation.BODY.fieldSession, raw);
  }
  return validate(UploadValidation.BODY.officeSession, raw);
}

export class UploadController {
  static async createSession(req: Request, res: Response): Promise<void> {
    const result = await UploadService.createSession(parseInitBody(req.body), authenticatedUser(req));
    ResponseHelper.created(res, COMMON_MESSAGES.CREATED, result);
  }

  static async uploadChunk(req: Request, res: Response): Promise<void> {
    const params = validate(UploadValidation.BODY.chunkParams, req.params);
    if (!Buffer.isBuffer(req.body)) throw new ResponseError("VALIDATION_ERROR", "Chunk upload harus berupa biner mentah.");
    const result = await UploadService.uploadChunk(params.uploadSessionId, authenticatedUser(req), req.header("content-range"), req.body);
    ResponseHelper.ok(res, COMMON_MESSAGES.UPDATED, result);
  }

  static async getStatus(req: Request, res: Response): Promise<void> {
    const params = validate(UploadValidation.BODY.chunkParams, req.params);
    const result = await UploadService.getStatus(params.uploadSessionId, authenticatedUser(req));
    ResponseHelper.ok(res, COMMON_MESSAGES.FETCHED, result);
  }

  static async complete(req: Request, res: Response): Promise<void> {
    const params = validate(UploadValidation.BODY.chunkParams, req.params);
    const result = await UploadService.complete(params.uploadSessionId, authenticatedUser(req));
    ResponseHelper.ok(res, COMMON_MESSAGES.UPDATED, result);
  }

  static async cancel(req: Request, res: Response): Promise<void> {
    const params = validate(UploadValidation.BODY.chunkParams, req.params);
    await UploadService.cancel(params.uploadSessionId, authenticatedUser(req));
    ResponseHelper.ok(res, COMMON_MESSAGES.DELETED, { cancelled: true });
  }
}
