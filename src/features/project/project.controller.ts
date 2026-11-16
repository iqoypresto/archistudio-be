import type { Request, Response } from "express";
import { PROJECT_MESSAGES } from "../../constants/message.constant.js";
import { ResponseHelper } from "../../helpers/response.helper.js";
import { ResponseError } from "../../utils/errors/response-error.util.js";
import { validate } from "../../validations/validate.js";
import { ProjectService } from "./project.service.js";
import { ProjectValidation } from "./project.validation.js";

export class ProjectController {
  /** Mengambil daftar project dengan paginasi (US-04). */
  static async getProjects(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new ResponseError("AUTHENTICATION_REQUIRED");
    const query = validate(ProjectValidation.QUERY.getProjects, req.query);
    const result = await ProjectService.getProjects(req.user, query);
    ResponseHelper.paginated(res, PROJECT_MESSAGES.LIST_FETCHED, result.projects, result.meta);
  }

  /** Mengambil detail project berdasarkan ID (US-04). */
  static async getProjectById(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new ResponseError("AUTHENTICATION_REQUIRED");
    const params = validate(ProjectValidation.PARAMS.id, req.params);
    const project = await ProjectService.getProjectById(req.user, params.id);
    ResponseHelper.ok(res, PROJECT_MESSAGES.DETAIL_FETCHED, project);
  }

  /** Membuat master project baru (US-04, AC-04.1). */
  static async createProject(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new ResponseError("AUTHENTICATION_REQUIRED");
    const body = validate(ProjectValidation.BODY.create, req.body);
    const project = await ProjectService.createProject(req.user, body);
    ResponseHelper.created(res, PROJECT_MESSAGES.CREATED, project);
  }

  /** Memperbarui master project (US-04). */
  static async updateProject(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new ResponseError("AUTHENTICATION_REQUIRED");
    const params = validate(ProjectValidation.PARAMS.id, req.params);
    const body = validate(ProjectValidation.BODY.update, req.body);
    const project = await ProjectService.updateProject(req.user, params.id, body);
    ResponseHelper.ok(res, PROJECT_MESSAGES.UPDATED, project);
  }

  /** Mengarsipkan project secara soft-delete (BR-05, NFR-05). */
  static async archiveProject(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new ResponseError("AUTHENTICATION_REQUIRED");
    const params = validate(ProjectValidation.PARAMS.id, req.params);
    const result = await ProjectService.archiveProject(req.user, params.id);
    ResponseHelper.ok(res, PROJECT_MESSAGES.ARCHIVED, result);
  }
}
