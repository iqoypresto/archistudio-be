import type { Role } from "@prisma/client";

export interface AuthenticatedUser {
  id: string;
  role: Role;
  username: string;
  name: string;
  jobTitle: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export {};
