import type { Request, Response } from "express";
import { AREA_MESSAGES } from "../../constants/message.constant.js";
import { ResponseHelper } from "../../helpers/response.helper.js";
import { ResponseError } from "../../utils/errors/response-error.util.js";
import { validate } from "../../validations/validate.js";
import { AreaService } from "./area.service.js";
import { AreaValidation } from "./area.validation.js";

export class AreaController {
  /** Mengambil daftar area dalam project (US-05). */
  static async getAreasByProject(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new ResponseError("AUTHENTICATION_REQUIRED");
    const params = validate(AreaValidation.PARAMS.projectId, req.params);
    const areas = await AreaService.getAreasByProject(req.user, params.projectId);
    ResponseHelper.ok(res, AREA_MESSAGES.LIST_FETCHED, areas);
  }

  /** Menambahkan area baru ke dalam project (US-05, AC-05.1). */
  static async createArea(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new ResponseError("AUTHENTICATION_REQUIRED");
    const params = validate(AreaValidation.PARAMS.projectId, req.params);
    const body = validate(AreaValidation.BODY.create, req.body);
    const area = await AreaService.createArea(req.user, params.projectId, body);
    ResponseHelper.created(res, AREA_MESSAGES.CREATED, area);
  }

  /** Memperbarui kode atau nama area (US-05). */
  static async updateArea(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new ResponseError("AUTHENTICATION_REQUIRED");
    const params = validate(AreaValidation.PARAMS.areaId, req.params);
    const body = validate(AreaValidation.BODY.update, req.body);
    const area = await AreaService.updateArea(req.user, params.areaId, body);
    ResponseHelper.ok(res, AREA_MESSAGES.UPDATED, area);
  }

  /** Menugaskan atau mengganti supervisor aktif (US-06, AC-06.1). */
  static async assignSupervisor(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new ResponseError("AUTHENTICATION_REQUIRED");
    const params = validate(AreaValidation.PARAMS.areaId, req.params);
    const body = validate(AreaValidation.BODY.assignSupervisor, req.body);
    const assignment = await AreaService.assignSupervisor(
      req.user,
      params.areaId,
      body,
    );
    ResponseHelper.ok(res, AREA_MESSAGES.ASSIGNMENT_CREATED, assignment);
  }

  /** Mengambil riwayat kronologis penugasan supervisor (US-06). */
  static async getAssignmentHistory(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new ResponseError("AUTHENTICATION_REQUIRED");
    const params = validate(AreaValidation.PARAMS.areaId, req.params);
    const history = await AreaService.getAssignmentHistory(req.user, params.areaId);
    ResponseHelper.ok(res, AREA_MESSAGES.ASSIGNMENTS_FETCHED, history);
  }
}
