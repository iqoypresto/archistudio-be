import type { Request, Response } from "express";
import { ResponseHelper } from "../../helpers/response.helper.js";
import { ResponseError } from "../../utils/errors/response-error.util.js";
import { validate } from "../../validations/validate.js";
import { PAYMENT_MESSAGES } from "./payment.helper.js";
import { PaymentService } from "./payment.service.js";
import { PaymentValidation } from "./payment.validation.js";

export class PaymentController {
  /** Mengambil daftar penerima pembayaran Freelance/Agent global (US-17, BR-36). */
  static async getPeople(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new ResponseError("AUTHENTICATION_REQUIRED");
    const query = validate(PaymentValidation.QUERY.getPeople, req.query);
    const people = await PaymentService.getPeople(req.user, query);
    ResponseHelper.ok(res, PAYMENT_MESSAGES.PEOPLE_FETCHED, people);
  }

  /** Menambahkan penerima pembayaran Freelance/Agent baru (US-17, AC-17.1, BR-36). */
  static async createPerson(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new ResponseError("AUTHENTICATION_REQUIRED");
    const body = validate(PaymentValidation.BODY.createPerson, req.body);
    const person = await PaymentService.createPerson(req.user, body);
    ResponseHelper.created(res, PAYMENT_MESSAGES.PERSON_CREATED, person);
  }

  /** Mengambil daftar catatan pembayaran untuk satu penerima (US-17, BR-36). */
  static async getRecordsByPerson(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new ResponseError("AUTHENTICATION_REQUIRED");
    const params = validate(PaymentValidation.PARAMS.personId, req.params);
    const query = validate(PaymentValidation.QUERY.getRecords, req.query);
    const records = await PaymentService.getRecordsByPerson(req.user, params.personId, query);
    ResponseHelper.ok(res, PAYMENT_MESSAGES.RECORDS_FETCHED, records);
  }

  /** Menambahkan catatan pembayaran baru (US-17, AC-17.1, BR-36). */
  static async createRecord(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new ResponseError("AUTHENTICATION_REQUIRED");
    const params = validate(PaymentValidation.PARAMS.personId, req.params);
    const body = validate(PaymentValidation.BODY.createRecord, req.body);
    const record = await PaymentService.createRecord(req.user, params.personId, body);
    ResponseHelper.created(res, PAYMENT_MESSAGES.RECORD_CREATED, record);
  }

  /** Memperbarui catatan pembayaran yang ada (US-17, BR-36). */
  static async updateRecord(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new ResponseError("AUTHENTICATION_REQUIRED");
    const params = validate(PaymentValidation.PARAMS.recordId, req.params);
    const body = validate(PaymentValidation.BODY.updateRecord, req.body);
    const record = await PaymentService.updateRecord(req.user, params.id, body);
    ResponseHelper.ok(res, PAYMENT_MESSAGES.RECORD_UPDATED, record);
  }
}
