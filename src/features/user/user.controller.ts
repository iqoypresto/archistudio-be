import type { Request, Response } from "express";
import { USER_MESSAGES } from "../../constants/message.constant.js";
import { ResponseHelper } from "../../helpers/response.helper.js";
import { ResponseError } from "../../utils/errors/response-error.util.js";
import { validate } from "../../validations/validate.js";
import { UserService } from "./user.service.js";
import { UserValidation } from "./user.validation.js";

export class UserController {
  /** Mengambil daftar pengguna berpaginasi beserta ringkasan global (US-02, US-03). */
  static async getUsers(req: Request, res: Response): Promise<void> {
    const query = validate(UserValidation.QUERY.getUsers, req.query);
    const result = await UserService.getUsers(query);
    ResponseHelper.paginated(res, USER_MESSAGES.LIST_FETCHED, result.users, result.meta, {
      summary: result.summary,
    });
  }

  /** Membuat akun pengguna baru (BR-01, BR-02, BR-04). */
  static async createUser(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new ResponseError("AUTHENTICATION_REQUIRED");
    const body = validate(UserValidation.BODY.create, req.body);
    const user = await UserService.createUser(req.user, body);
    ResponseHelper.created(res, USER_MESSAGES.CREATED, user);
  }

  /** Memperbarui data pengguna (BR-01, BR-02). */
  static async updateUser(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new ResponseError("AUTHENTICATION_REQUIRED");
    const params = validate(UserValidation.PARAMS.id, req.params);
    const body = validate(UserValidation.BODY.update, req.body);
    const user = await UserService.updateUser(req.user, params.id, body);
    ResponseHelper.ok(res, USER_MESSAGES.UPDATED, user);
  }

  /** Me-reset kata sandi pengguna secara manual (BR-04). */
  static async resetPassword(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new ResponseError("AUTHENTICATION_REQUIRED");
    const params = validate(UserValidation.PARAMS.id, req.params);
    const body = validate(UserValidation.BODY.resetPassword, req.body);
    const user = await UserService.resetPassword(req.user, params.id, body);
    ResponseHelper.ok(res, USER_MESSAGES.PASSWORD_RESET, {
      id: user.id,
      username: user.username,
    });
  }

  /** Mengubah status aktif/nonaktif akun (BR-05). */
  static async toggleStatus(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new ResponseError("AUTHENTICATION_REQUIRED");
    const params = validate(UserValidation.PARAMS.id, req.params);
    const body = validate(UserValidation.BODY.toggleStatus, req.body);
    const user = await UserService.toggleStatus(req.user, params.id, body);
    ResponseHelper.ok(res, USER_MESSAGES.STATUS_UPDATED, {
      id: user.id,
      isActive: user.isActive,
    });
  }
}
