import type { Request, Response } from "express";
import { ResponseHelper } from "../../helpers/response.helper.js";
import { ResponseError } from "../../utils/errors/response-error.util.js";
import { validate } from "../../validations/validate.js";
import { COMMS_MESSAGES } from "./comms.helper.js";
import { CommsService } from "./comms.service.js";
import { CommsValidation } from "./comms.validation.js";

export class CommsController {
  /** Mengambil daftar catatan Comms dalam project (US-20, BR-35). */
  static async listEntries(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new ResponseError("AUTHENTICATION_REQUIRED");
    const params = validate(CommsValidation.PARAMS.projectId, req.params);
    const query = validate(CommsValidation.QUERY.list, req.query);
    const entries = await CommsService.listEntries(req.user, params.projectId, query);
    ResponseHelper.ok(res, COMMS_MESSAGES.LIST_FETCHED, entries);
  }

  /** Membuat catatan Comms baru oleh OWNER (US-20, AC-20.1, BR-35). */
  static async createEntry(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new ResponseError("AUTHENTICATION_REQUIRED");
    const params = validate(CommsValidation.PARAMS.projectId, req.params);
    const body = validate(CommsValidation.BODY.create, req.body);
    const entry = await CommsService.createEntry(req.user, params.projectId, body);
    ResponseHelper.created(res, COMMS_MESSAGES.CREATED, entry);
  }

  /** Memperbarui catatan Comms oleh OWNER (US-20, BR-35). */
  static async updateEntry(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new ResponseError("AUTHENTICATION_REQUIRED");
    const params = validate(CommsValidation.PARAMS.commsId, req.params);
    const body = validate(CommsValidation.BODY.update, req.body);
    const entry = await CommsService.updateEntry(req.user, params.id, body);
    ResponseHelper.ok(res, COMMS_MESSAGES.UPDATED, entry);
  }
}
