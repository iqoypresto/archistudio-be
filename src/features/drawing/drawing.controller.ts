import type { Request, Response } from "express";
import { ResponseHelper } from "../../helpers/response.helper.js";
import { ResponseError } from "../../utils/errors/response-error.util.js";
import { validate } from "../../validations/validate.js";
import { DRAWING_MESSAGES } from "./drawing.helper.js";
import { DrawingService } from "./drawing.service.js";
import { DrawingValidation } from "./drawing.validation.js";

export class DrawingController {
  /** Mengambil galeri Drawing In/Out project (US-18, BR-32). */
  static async listDrawings(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new ResponseError("AUTHENTICATION_REQUIRED");
    const params = validate(DrawingValidation.PARAMS.projectId, req.params);
    const query = validate(DrawingValidation.QUERY.list, req.query);
    const drawings = await DrawingService.listDrawings(req.user, params.projectId, query);
    ResponseHelper.ok(res, DRAWING_MESSAGES.LIST_FETCHED, drawings);
  }

  /** Mengunggah metadata Drawing baru oleh OWNER (US-18, AC-18.1, BR-32, BR-33). */
  static async createDrawing(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new ResponseError("AUTHENTICATION_REQUIRED");
    const params = validate(DrawingValidation.PARAMS.projectId, req.params);
    const body = validate(DrawingValidation.BODY.create, req.body);
    const drawing = await DrawingService.createDrawing(req.user, params.projectId, body);
    ResponseHelper.created(res, DRAWING_MESSAGES.CREATED, drawing);
  }

  /** Mengarsipkan Drawing oleh OWNER (US-18, BR-32). */
  static async archiveDrawing(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new ResponseError("AUTHENTICATION_REQUIRED");
    const params = validate(DrawingValidation.PARAMS.drawingId, req.params);
    const drawing = await DrawingService.archiveDrawing(req.user, params.id);
    ResponseHelper.ok(res, DRAWING_MESSAGES.ARCHIVED, drawing);
  }
}
