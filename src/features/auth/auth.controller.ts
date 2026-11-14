import type { Request, Response } from "express";
import { AUTH_MESSAGES } from "../../constants/message.constant.js";
import { ResponseHelper } from "../../helpers/response.helper.js";
import { ResponseError } from "../../utils/errors/response-error.util.js";
import { validate } from "../../validations/validate.js";
import { AuthService } from "./auth.service.js";
import { AuthValidation } from "./auth.validation.js";

export class AuthController {
  /** Memproses login username/no HP dan password (US-01). */
  static async login(req: Request, res: Response): Promise<void> {
    const body = validate(AuthValidation.BODY.login, req.body);
    const result = await AuthService.login(body);
    ResponseHelper.ok(res, AUTH_MESSAGES.LOGIN_SUCCESS, result);
  }

  /** Memproses pembaruan dan rotasi refresh token. */
  static async refresh(req: Request, res: Response): Promise<void> {
    const body = validate(AuthValidation.BODY.refresh, req.body);
    const result = await AuthService.refresh(body);
    ResponseHelper.ok(res, AUTH_MESSAGES.REFRESH_SUCCESS, result);
  }

  /** Mencabut sesi refresh token user saat logout. */
  static async logout(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new ResponseError("AUTHENTICATION_REQUIRED");
    const body = validate(AuthValidation.BODY.logout, req.body);
    const result = await AuthService.logout(body, req.user.id);
    ResponseHelper.ok(res, AUTH_MESSAGES.LOGOUT_SUCCESS, result);
  }

  /** Mengembalikan profil akun pengguna yang sedang login. */
  static async getMe(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new ResponseError("AUTHENTICATION_REQUIRED");
    const profile = await AuthService.getMe(req.user.id);
    ResponseHelper.ok(res, AUTH_MESSAGES.PROFILE_FETCHED, profile);
  }
}
