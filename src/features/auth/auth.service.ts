import { env } from "../../configs/env.config.js";
import { comparePassword, hashTokenSha256 } from "../../utils/auth/bcrypt.util.js";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../../utils/auth/jwt.util.js";
import { ResponseError } from "../../utils/errors/response-error.util.js";
import { AuthRepository } from "./auth.repository.js";
import type {
  AuthUserProfile,
  LoginBody,
  LoginResult,
  LogoutBody,
  MeProfile,
  RefreshResult,
  RefreshTokenBody,
} from "./auth.type.js";

/** Menghitung tanggal kedaluwarsa refresh token dari konfigurasi hari. */
function buildRefreshExpiryDate(): Date {
  const msPerDay = 86_400_000;
  return new Date(Date.now() + env.JWT_REFRESH_EXPIRES_DAYS * msPerDay);
}

/** Membentuk pasangan accessToken dan refreshToken untuk user terverifikasi. */
function issueTokenPair(user: AuthUserProfile) {
  const accessToken = signAccessToken({
    sub: user.id,
    role: user.role,
    username: user.username,
    name: user.name,
    jobTitle: user.jobTitle,
  });
  const refreshToken = signRefreshToken(user.id);
  return { accessToken, refreshToken };
}

export class AuthService {
  /** Login dengan username/no HP & password, memblokir akun nonaktif (BR-04, BR-05). */
  static async login(body: LoginBody): Promise<LoginResult> {
    const user = await AuthRepository.findUserByIdentifier(body.identifier);
    if (!user) throw new ResponseError("INVALID_CREDENTIALS");
    const isMatch = await comparePassword(body.password, user.passwordHash);
    if (!isMatch) throw new ResponseError("INVALID_CREDENTIALS");
    if (!user.isActive || user.deletedAt !== null) {
      throw new ResponseError("ACCOUNT_INACTIVE");
    }
    const profile: AuthUserProfile = {
      id: user.id,
      name: user.name,
      username: user.username,
      phone: user.phone,
      role: user.role,
      jobTitle: user.jobTitle,
    };
    const tokens = issueTokenPair(profile);
    await AuthRepository.createRefreshToken({
      userId: user.id,
      tokenHash: hashTokenSha256(tokens.refreshToken),
      expiresAt: buildRefreshExpiryDate(),
    });
    return { ...tokens, user: profile };
  }

  /** Memperbarui pasangan token dengan rotasi refresh token dan cek status aktif (BR-05). */
  static async refresh(body: RefreshTokenBody): Promise<RefreshResult> {
    verifyRefreshToken(body.refreshToken);
    const oldHash = hashTokenSha256(body.refreshToken);
    const stored = await AuthRepository.findRefreshTokenByHash(oldHash);
    const now = new Date();
    if (!stored || stored.revokedAt !== null || stored.expiresAt <= now) {
      throw new ResponseError("REFRESH_TOKEN_INVALID");
    }
    const { user } = stored;
    if (!user.isActive || user.deletedAt !== null) {
      throw new ResponseError("ACCOUNT_INACTIVE");
    }
    const tokens = issueTokenPair(user);
    const rotated = await AuthRepository.rotateRefreshToken({
      oldTokenId: stored.id,
      userId: user.id,
      newTokenHash: hashTokenSha256(tokens.refreshToken),
      newExpiresAt: buildRefreshExpiryDate(),
      now,
    });
    if (!rotated) throw new ResponseError("REFRESH_TOKEN_INVALID");
    return tokens;
  }

  /** Mencabut refresh token saat user logout. */
  static async logout(body: LogoutBody, userId: string) {
    const tokenHash = hashTokenSha256(body.refreshToken);
    await AuthRepository.revokeRefreshToken(tokenHash, userId, new Date());
    return { loggedOut: true };
  }

  /** Mengambil profil user aktif saat ini (BR-05). */
  static async getMe(userId: string): Promise<MeProfile> {
    const user = await AuthRepository.findUserById(userId);
    if (!user || !user.isActive || user.deletedAt !== null) {
      throw new ResponseError("ACCOUNT_INACTIVE");
    }
    return {
      id: user.id,
      name: user.name,
      username: user.username,
      phone: user.phone,
      role: user.role,
      jobTitle: user.jobTitle,
      isActive: user.isActive,
    };
  }
}
