import type { Role } from "@prisma/client";
import type { z } from "zod";
import type { AuthValidation } from "./auth.validation.js";

export type LoginBody = z.infer<typeof AuthValidation.BODY.login>;
export type RefreshTokenBody = z.infer<typeof AuthValidation.BODY.refresh>;
export type LogoutBody = z.infer<typeof AuthValidation.BODY.logout>;

export interface AuthUserProfile {
  id: string;
  name: string;
  username: string;
  phone: string;
  role: Role;
  jobTitle: string;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: AuthUserProfile;
}

export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
}

export interface MeProfile extends AuthUserProfile {
  isActive: boolean;
}
