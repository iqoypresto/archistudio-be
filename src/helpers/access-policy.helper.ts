import { Role } from "@prisma/client";
import type { AuthenticatedUser } from "../types/express.js";

/** Kebijakan terpusat role yang diizinkan mengakses Comms In/Out (BR-35, K-02, ADR-10). */
export const COMMS_ALLOWED_ROLES: readonly Role[] = [
  Role.OWNER,
  Role.ADMIN,
  Role.SITE_MANAGER,
  Role.SUPERVISOR,
];

/** Role operasional lapangan mobile-first yang dapat di-plot pada AreaAssignment (K-01). */
export const FIELD_ROLES: readonly Role[] = [Role.SITE_MANAGER, Role.SUPERVISOR];

export function isFieldRole(role: Role): boolean {
  return FIELD_ROLES.includes(role);
}

export function isCommsAllowedRole(role: Role): boolean {
  return COMMS_ALLOWED_ROLES.includes(role);
}

export function canEditCommsEntry(
  actor: AuthenticatedUser,
  createdById: string,
): boolean {
  return actor.role === Role.OWNER || actor.id === createdById;
}
