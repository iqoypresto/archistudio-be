import type { Request, Response } from "express";
import { ResponseHelper } from "../../helpers/response.helper.js";
import { ResponseError } from "../../utils/errors/response-error.util.js";
import { validate } from "../../validations/validate.js";
import { PROJECT_DOCUMENT_MESSAGES } from "./project-document.helper.js";
import { ProjectDocumentService } from "./project-document.service.js";
import { ProjectDocumentValidation } from "./project-document.validation.js";

export class ProjectDocumentController {
  /** Mengambil daftar dokumen keluar project (US-19, BR-34). */
  static async listDocuments(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new ResponseError("AUTHENTICATION_REQUIRED");
    const params = validate(ProjectDocumentValidation.PARAMS.projectId, req.params);
    const query = validate(ProjectDocumentValidation.QUERY.list, req.query);
    const documents = await ProjectDocumentService.listDocuments(req.user, params.projectId, query);
    ResponseHelper.ok(res, PROJECT_DOCUMENT_MESSAGES.LIST_FETCHED, documents);
  }

  /** Menyimpan dokumen keluar project baru oleh OWNER (US-19, AC-19.1, BR-34). */
  static async createDocument(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new ResponseError("AUTHENTICATION_REQUIRED");
    const params = validate(ProjectDocumentValidation.PARAMS.projectId, req.params);
    const body = validate(ProjectDocumentValidation.BODY.create, req.body);
    const document = await ProjectDocumentService.createDocument(req.user, params.projectId, body);
    ResponseHelper.created(res, PROJECT_DOCUMENT_MESSAGES.CREATED, document);
  }

  /** Menghapus permanen dokumen keluar oleh OWNER (US-19, AC-19.1, BR-34). */
  static async deleteDocument(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new ResponseError("AUTHENTICATION_REQUIRED");
    const params = validate(ProjectDocumentValidation.PARAMS.documentId, req.params);
    const result = await ProjectDocumentService.deleteDocument(req.user, params.id);
    ResponseHelper.ok(res, PROJECT_DOCUMENT_MESSAGES.DELETED, result);
  }
}
