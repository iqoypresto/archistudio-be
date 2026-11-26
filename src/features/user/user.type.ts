import type { Role } from "@prisma/client";
import type { z } from "zod";
import type { UserValidation } from "./user.validation.js";

export type GetUsersQuery = z.infer<typeof UserValidation.QUERY.getUsers>;
export type CreateUserDTO = z.infer<typeof UserValidation.BODY.create>;
export type UpdateUserDTO = z.infer<typeof UserValidation.BODY.update>;
export type ResetPasswordDTO = z.infer<typeof UserValidation.BODY.resetPassword>;
export type ToggleStatusDTO = z.infer<typeof UserValidation.BODY.toggleStatus>;

export interface UserListItem {
  id: string;
  name: string;
  username: string;
  phone: string;
  role: Role;
  jobTitle: string;
  isActive: boolean;
  activeAreaCount?: number;
  managedProjectCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserSummaryCount {
  total: number;
  active: number;
  inactive: number;
  byRole: Record<Role, number>;
}
