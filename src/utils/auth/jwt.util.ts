import crypto from "node:crypto";
import type { Role } from "@prisma/client";
import jwt from "jsonwebtoken";
import { env } from "../../configs/env.config.js";
import { ResponseError } from "../errors/response-error.util.js";

export interface AccessTokenPayload {
  sub: string;
  role: Role;
  username: string;
  name: string;
  jobTitle: string;
}

export interface RefreshTokenPayload {
  sub: string;
  jti: string;
}

/** Menandatangani JWT access token berumur pendek (ADR-01). */
export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
}

/** Menandatangani JWT refresh token berumur panjang dengan ID unik (jti). */
export function signRefreshToken(userId: string): string {
  const payload: RefreshTokenPayload = { sub: userId, jti: crypto.randomUUID() };
  const expiresInDays = `${env.JWT_REFRESH_EXPIRES_DAYS}d`;
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: expiresInDays as jwt.SignOptions["expiresIn"],
  });
}

/** Memverifikasi JWT access token dan memetakan error kedaluwarsa (ADR-01). */
export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);
    if (typeof decoded === "string" || typeof decoded.sub !== "string") {
      throw new ResponseError("AUTHENTICATION_REQUIRED");
    }
    return decoded as unknown as AccessTokenPayload;
  } catch (err: unknown) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new ResponseError("ACCESS_TOKEN_EXPIRED");
    }
    if (err instanceof ResponseError) throw err;
    throw new ResponseError("AUTHENTICATION_REQUIRED");
  }
}

/** Memverifikasi JWT refresh token. */
export function verifyRefreshToken(token: string): RefreshTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET);
    if (typeof decoded === "string" || typeof decoded.sub !== "string") {
      throw new ResponseError("REFRESH_TOKEN_INVALID");
    }
    return decoded as unknown as RefreshTokenPayload;
  } catch (err: unknown) {
    if (err instanceof ResponseError) throw err;
    throw new ResponseError("REFRESH_TOKEN_INVALID");
  }
}
