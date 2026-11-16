import type { z } from "zod";
import type { AreaValidation } from "./area.validation.js";

export type CreateAreaDTO = z.infer<typeof AreaValidation.BODY.create>;
export type UpdateAreaDTO = z.infer<typeof AreaValidation.BODY.update>;
export type AssignSupervisorDTO = z.infer<typeof AreaValidation.BODY.assignSupervisor>;

export interface SupervisorSummary {
  id: string;
  name: string;
  username: string;
  phone: string;
  jobTitle: string;
}

export interface ActiveAssignmentItem {
  id: string;
  supervisorId: string;
  startDate: Date;
  endDate: Date | null;
  supervisor: SupervisorSummary;
}

export interface AreaListItem {
  id: string;
  projectId: string;
  code: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  activeAssignment?: ActiveAssignmentItem | null;
}

export interface AssignmentHistoryItem {
  id: string;
  areaId: string;
  supervisorId: string;
  startDate: Date;
  endDate: Date | null;
  createdAt: Date;
  supervisor: SupervisorSummary;
  assignedBy: {
    id: string;
    name: string;
  };
}
