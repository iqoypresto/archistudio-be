import type { Role } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../utils/auth/jwt.util.js";
import { ResponseError } from "../utils/errors/response-error.util.js";

/** Mengekstrak token Bearer dari header Authorization (ADR-01). */
function extractBearerToken(req: Request): string {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw new ResponseError("AUTHENTICATION_REQUIRED");
  }
  const token = header.slice(7).trim();
  if (!token) {
    throw new ResponseError("AUTHENTICATION_REQUIRED");
  }
  return token;
}

export class AuthMiddleware {
  /** Memverifikasi JWT access token pada header Authorization dan mengisi req.user. */
  static authenticate(req: Request, _res: Response, next: NextFunction): void {
    const token = extractBearerToken(req);
    const payload = verifyAccessToken(token);
    req.user = {
      id: payload.sub,
      role: payload.role,
      username: payload.username,
      name: payload.name,
      jobTitle: payload.jobTitle,
    };
    next();
  }

  /** Membatasi akses endpoint hanya untuk daftar role yang diizinkan (RBAC). */
  static authorizeRoles(...roles: Role[]) {
    return (req: Request, _res: Response, next: NextFunction): void => {
      if (!req.user) {
        throw new ResponseError("AUTHENTICATION_REQUIRED");
      }
      if (!roles.includes(req.user.role)) {
        throw new ResponseError("FORBIDDEN");
      }
      next();
    };
  }
}
