import type { Request, Response } from "express";
import { PROJECT_MESSAGES } from "../../constants/message.constant.js";
import { ResponseHelper } from "../../helpers/response.helper.js";
import { ResponseError } from "../../utils/errors/response-error.util.js";
import { validate } from "../../validations/validate.js";
import { PROJECT_ARCHIVE_MESSAGES } from "./project.helper.js";
import { ProjectService } from "./project.service.js";
import { ProjectValidation } from "./project.validation.js";

export class ProjectController {
  /** Mengambil daftar project aktif berpaginasi (US-04). */
  static async getProjects(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new ResponseError("AUTHENTICATION_REQUIRED");
    const query = validate(ProjectValidation.QUERY.getProjects, req.query);
    const result = await ProjectService.getProjects(req.user, query);
    ResponseHelper.paginated(
      res,
      PROJECT_MESSAGES.LIST_FETCHED,
      result.projects,
      result.meta,
      result.statusCounts ? { statusCounts: result.statusCounts } : undefined,
    );
  }

  /** Mengambil daftar Archive Project untuk OWNER/ADMIN (US-22, BR-39). */
  static async getArchivedProjects(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new ResponseError("AUTHENTICATION_REQUIRED");
    const query = validate(ProjectValidation.QUERY.getArchive, req.query);
    const projects = await ProjectService.getArchivedProjects(req.user, query);
    ResponseHelper.ok(res, PROJECT_ARCHIVE_MESSAGES.ARCHIVE_FETCHED, projects);
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

  /** Memperbarui master project aktif (US-04). */
  static async updateProject(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new ResponseError("AUTHENTICATION_REQUIRED");
    const params = validate(ProjectValidation.PARAMS.id, req.params);
    const body = validate(ProjectValidation.BODY.update, req.body);
    const project = await ProjectService.updateProject(req.user, params.id, body);
    ResponseHelper.ok(res, PROJECT_MESSAGES.UPDATED, project);
  }

  /** Menandai project selesai & masuk Archive oleh OWNER (US-22, BR-12, BR-39). */
  static async completeProject(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new ResponseError("AUTHENTICATION_REQUIRED");
    const params = validate(ProjectValidation.PARAMS.id, req.params);
    const project = await ProjectService.completeProject(req.user, params.id);
    ResponseHelper.ok(res, PROJECT_ARCHIVE_MESSAGES.COMPLETED, project);
  }

  /** Mengarsipkan project secara manual oleh OWNER (US-22, BR-39). */
  static async archiveProject(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new ResponseError("AUTHENTICATION_REQUIRED");
    const params = validate(ProjectValidation.PARAMS.id, req.params);
    const project = await ProjectService.archiveProject(req.user, params.id);
    ResponseHelper.ok(res, PROJECT_ARCHIVE_MESSAGES.ARCHIVED, project);
  }

  /** Memulihkan project dari Archive oleh OWNER (US-22, BR-39). */
  static async restoreProject(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new ResponseError("AUTHENTICATION_REQUIRED");
    const params = validate(ProjectValidation.PARAMS.id, req.params);
    const body = validate(ProjectValidation.BODY.restore, req.body);
    const project = await ProjectService.restoreProject(req.user, params.id, body);
    ResponseHelper.ok(res, PROJECT_ARCHIVE_MESSAGES.RESTORED, project);
  }
}
