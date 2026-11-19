import type { ProjectStatus } from "@prisma/client";
import type { z } from "zod";
import type { ProjectValidation } from "./project.validation.js";

export type GetProjectsQuery = z.infer<typeof ProjectValidation.QUERY.getProjects>;
export type GetArchiveQuery = z.infer<typeof ProjectValidation.QUERY.getArchive>;
export type CreateProjectDTO = z.infer<typeof ProjectValidation.BODY.create>;
export type UpdateProjectDTO = z.infer<typeof ProjectValidation.BODY.update>;
export type RestoreProjectDTO = z.infer<typeof ProjectValidation.BODY.restore>;

export type ArchiveType = "COMPLETED" | "MANUAL";

export interface ProjectListItem {
  id: string;
  code: string;
  name: string;
  location: string;
  clientName: string;
  startDate: Date;
  endDate: Date | null;
  status: ProjectStatus;
  timezone: string;
  routineHolidays: number[];
  completedAt?: Date | null;
  archivedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  _count?: {
    areas: number;
  };
}

export interface ProjectAreaSummary {
  id: string;
  code: string;
  name: string;
}

export interface ProjectDetail extends ProjectListItem {
  areas: ProjectAreaSummary[];
}

export interface ArchivedProjectItem extends ProjectListItem {
  archiveType: ArchiveType;
  archiveYear: number;
  archivedActionAt: Date;
}
