import type { Request, Response } from "express";
import { COMMON_MESSAGES } from "../../constants/message.constant.js";
import { ResponseHelper } from "../../helpers/response.helper.js";
import { ResponseError } from "../../utils/errors/response-error.util.js";
import { validate } from "../../validations/validate.js";
import { ReportLockService } from "./report-lock.service.js";
import { ReportService } from "./report.service.js";
import { ReportUnlockService } from "./report-unlock.service.js";
import {
  unlockAreaBodySchema,
  unlockAreaParamsSchema,
} from "./report-unlock.validation.js";
import { ReportValidation } from "./report.validation.js";

export class ReportController {
  /** Mengembalikan status tugas harian & kunci bertahap area milik supervisor (US-07, US-10). */
  static async getMyAreasStatus(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new ResponseError("AUTHENTICATION_REQUIRED");
    const result = await ReportLockService.getMyAreasStatus(req.user.id);
    ResponseHelper.ok(res, COMMON_MESSAGES.FETCHED, result);
  }

  /** Mengembalikan daftar laporan harian berpaginasi sesuai cakupan role (US-12, US-13). */
  static async listReports(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new ResponseError("AUTHENTICATION_REQUIRED");
    const query = validate(ReportValidation.QUERY.list, req.query);
    const { items, meta } = await ReportService.listReports(query, req.user);
    ResponseHelper.paginated(res, COMMON_MESSAGES.FETCHED, items, meta);
  }

  /** Mengembalikan detail laporan harian beserta foto dan riwayat revisi (US-13). */
  static async getReportById(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new ResponseError("AUTHENTICATION_REQUIRED");
    const { id } = validate(ReportValidation.PARAMS.id, req.params);
    const result = await ReportService.getReportById(id, req.user);
    ResponseHelper.ok(res, COMMON_MESSAGES.FETCHED, result);
  }

  /** Menyimpan draf laporan harian baru atau memperbarui draf pada tanggal yang sama (US-08, US-09). */
  static async saveDraft(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new ResponseError("AUTHENTICATION_REQUIRED");
    const body = validate(ReportValidation.BODY.saveDraft, req.body);
    const result = await ReportService.saveDraft(body, req.user);
    ResponseHelper.created(res, COMMON_MESSAGES.CREATED, result);
  }

  /** Memperbarui isi draf laporan harian sebelum dikirim (BR-17). */
  static async updateDraft(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new ResponseError("AUTHENTICATION_REQUIRED");
    const { id } = validate(ReportValidation.PARAMS.id, req.params);
    const body = validate(ReportValidation.BODY.updateDraft, req.body);
    const result = await ReportService.updateDraft(id, body, req.user);
    ResponseHelper.ok(res, COMMON_MESSAGES.UPDATED, result);
  }

  /** Mengirim laporan harian dengan validasi lengkap, paraf otomatis, & cutoff 17:00 (BR-18, BR-26). */
  static async submitReport(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new ResponseError("AUTHENTICATION_REQUIRED");
    const { id } = validate(ReportValidation.PARAMS.id, req.params);
    const body = validate(ReportValidation.BODY.submit, req.body);
    const result = await ReportService.submitReport(id, body, req.user);
    ResponseHelper.ok(res, "Laporan harian berhasil dikirim.", result);
  }

  /** Merevisi isi laporan terkirim khusus OWNER + mencatat riwayat snapshot (US-14, BR-24). */
  static async reviseReport(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new ResponseError("AUTHENTICATION_REQUIRED");
    const { id } = validate(ReportValidation.PARAMS.id, req.params);
    const body = validate(ReportValidation.BODY.revise, req.body);
    const result = await ReportService.reviseReport(id, body, req.user);
    ResponseHelper.ok(res, "Laporan harian berhasil direvisi oleh Owner.", result);
  }

  /** Membuka kunci manual untuk area yang tertunggak > 3 hari kerja (US-11, BR-22). */
  static async unlockArea(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new ResponseError("AUTHENTICATION_REQUIRED");
    const { areaId } = validate(unlockAreaParamsSchema, req.params);
    const body = validate(unlockAreaBodySchema, req.body);
    const result = await ReportUnlockService.unlockArea(areaId, req.user.id, body);
    ResponseHelper.created(res, "Kunci laporan area berhasil dibuka secara manual.", result);
  }
}
