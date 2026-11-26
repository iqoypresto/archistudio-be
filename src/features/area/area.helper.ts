import { Prisma, ProjectStatus } from "@prisma/client";
import type { AuthenticatedUser } from "../../types/express.d.js";
import { ResponseError } from "../../utils/errors/response-error.util.js";
import type {
  ActiveAssignmentItem,
  AreaListItem,
  ProjectLifecycleState,
} from "./area.type.js";

export const supervisorSelect = Prisma.validator<Prisma.UserSelect>()({
  id: true,
  name: true,
  username: true,
  phone: true,
  jobTitle: true,
  role: true,
  isActive: true,
});

export const assignmentSelect = Prisma.validator<Prisma.AreaAssignmentSelect>()({
  id: true,
  supervisorId: true,
  startDate: true,
  endDate: true,
  supervisor: { select: supervisorSelect },
});

export const areaSelect = Prisma.validator<Prisma.AreaSelect>()({
  id: true,
  projectId: true,
  code: true,
  name: true,
  createdAt: true,
  updatedAt: true,
  assignments: {
    where: { endDate: null },
    take: 1,
    select: assignmentSelect,
  },
});

export const areaWithProjectSelect = Prisma.validator<Prisma.AreaSelect>()({
  ...areaSelect,
  project: {
    select: {
      status: true,
      archivedAt: true,
    },
  },
});

export type RawAreaItem = Omit<AreaListItem, "activeAssignment"> & {
  assignments: ActiveAssignmentItem[];
};

export function formatArea(raw: RawAreaItem): AreaListItem {
  const { assignments, ...rest } = raw;
  return { ...rest, activeAssignment: assignments[0] ?? null };
}

/** Memastikan hanya OWNER atau ADMIN yang boleh mengelola area & penugasan (BR-09). */
export function assertCanManageArea(actor: AuthenticatedUser, message: string): void {
  if (actor.role !== "OWNER" && actor.role !== "ADMIN") {
    throw new ResponseError("FORBIDDEN", message);
  }
}

/** Memastikan project belum selesai atau diarsipkan sebelum mengubah area/penugasan (BR-12, BR-39). */
export function assertProjectMutable(project?: ProjectLifecycleState | null): void {
  if (!project) return;
  if (project.status === ProjectStatus.SELESAI || project.archivedAt != null) {
    throw new ResponseError(
      "PROJECT_ALREADY_COMPLETED",
      "Project sudah selesai atau diarsipkan sehingga area dan penugasan bersifat baca saja.",
    );
  }
}
