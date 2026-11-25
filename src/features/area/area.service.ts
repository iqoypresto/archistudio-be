import { addDaysToDateString, parseDateOnlyUtc } from "../../helpers/date.helper.js";
import { isFieldRole } from "../../helpers/access-policy.helper.js";
import type { AuthenticatedUser } from "../../types/express.d.js";
import { ResponseError } from "../../utils/errors/response-error.util.js";
import { ProjectRepository } from "../project/project.repository.js";
import { UserRepository } from "../user/user.repository.js";
import { assertCanManageArea, assertProjectMutable } from "./area.helper.js";
import { AreaRepository } from "./area.repository.js";
import type {
  ActiveAssignmentItem,
  AreaListItem,
  AssignSupervisorDTO,
  AssignmentHistoryItem,
  CreateAreaDTO,
  UpdateAreaDTO,
} from "./area.type.js";

/** Memastikan target user berstatus aktif dengan peran SUPERVISOR atau SITE_MANAGER (BR-05, BR-08, K-01). */
async function assertActiveSupervisor(supervisorId: string): Promise<void> {
  const supervisor = await UserRepository.findById(supervisorId);
  if (!supervisor || !supervisor.isActive || !isFieldRole(supervisor.role)) {
    throw new ResponseError("SUPERVISOR_NOT_ACTIVE");
  }
}

/** Menghitung tanggal berhenti penugasan lama (H-1) & memvalidasi pergantian (BR-08, BR-10). */
function resolvePreviousAssignmentEndDate(
  active: ActiveAssignmentItem | null | undefined,
  dto: AssignSupervisorDTO,
): Date | undefined {
  if (!active) return undefined;

  const currentStartStr = active.startDate.toISOString().slice(0, 10);
  if (dto.effectiveStartDate <= currentStartStr) {
    throw new ResponseError("INVALID_ASSIGNMENT_DATE");
  }
  if (active.supervisorId === dto.supervisorId) {
    throw new ResponseError(
      "CONFLICT",
      "Supervisor tersebut sudah menjadi supervisor aktif pada area ini.",
    );
  }
  return parseDateOnlyUtc(addDaysToDateString(dto.effectiveStartDate, -1));
}

export class AreaService {
  /** Mengambil daftar area dalam project sesuai scope aktif role (US-05, US-24, BR-03, BR-09, BR-41). */
  static async getAreasByProject(
    actor: AuthenticatedUser,
    projectId: string,
  ): Promise<AreaListItem[]> {
    const project = await ProjectRepository.findById(projectId);
    if (!project) {
      throw new ResponseError("RESOURCE_NOT_FOUND", "Project tidak ditemukan.");
    }

    if (actor.role === "SITE_MANAGER") {
      if (project.siteManagerId === actor.id) {
        return AreaRepository.findManyByProjectId(projectId);
      }
      const ownAreas = await AreaRepository.findManyByProjectId(projectId, actor.id);
      if (ownAreas.length === 0) {
        throw new ResponseError("AREA_SCOPE_FORBIDDEN");
      }
      return ownAreas;
    }

    const supervisorUserId = actor.role === "SUPERVISOR" ? actor.id : undefined;
    const areas = await AreaRepository.findManyByProjectId(projectId, supervisorUserId);

    if (actor.role === "SUPERVISOR" && areas.length === 0) {
      throw new ResponseError("AREA_SCOPE_FORBIDDEN");
    }
    return areas;
  }

  /** Membuat Area baru dan menetapkan supervisor aktif awal (US-05, AC-05.1, BR-08, BR-09, BR-13). */
  static async createArea(
    actor: AuthenticatedUser,
    projectId: string,
    dto: CreateAreaDTO,
  ): Promise<AreaListItem> {
    assertCanManageArea(actor, "Hanya Owner atau Admin yang dapat menambahkan area.");

    const project = await ProjectRepository.findById(projectId);
    if (!project) {
      throw new ResponseError("RESOURCE_NOT_FOUND", "Project tidak ditemukan.");
    }
    assertProjectMutable(project);

    const codeExists = await AreaRepository.findByCodeInProject(projectId, dto.code);
    if (codeExists) {
      throw new ResponseError("CONFLICT", "Kode area sudah digunakan pada project ini.");
    }
    await assertActiveSupervisor(dto.initialSupervisorId);

    return AreaRepository.createWithInitialAssignment({
      projectId,
      code: dto.code,
      name: dto.name,
      supervisorId: dto.initialSupervisorId,
      startDate: parseDateOnlyUtc(dto.startDate),
      assignedById: actor.id,
    });
  }

  /** Memperbarui kode atau nama area pada project aktif (US-05, BR-12, BR-13). */
  static async updateArea(
    actor: AuthenticatedUser,
    areaId: string,
    dto: UpdateAreaDTO,
  ): Promise<AreaListItem> {
    assertCanManageArea(actor, "Hanya Owner atau Admin yang dapat mengubah area.");

    const existing = await AreaRepository.findById(areaId);
    if (!existing) {
      throw new ResponseError("RESOURCE_NOT_FOUND", "Area tidak ditemukan.");
    }
    assertProjectMutable(existing.project);

    if (dto.code && dto.code !== existing.code) {
      const codeExists = await AreaRepository.findByCodeInProject(
        existing.projectId,
        dto.code,
        areaId,
      );
      if (codeExists) {
        throw new ResponseError("CONFLICT", "Kode area sudah digunakan pada project ini.");
      }
    }

    return AreaRepository.update(areaId, {
      ...(dto.code && { code: dto.code }),
      ...(dto.name && { name: dto.name }),
    });
  }

  /** Menugaskan/mengganti supervisor aktif; supervisor boleh memegang multi-area/project (US-24, BR-08..BR-10). */
  static async assignSupervisor(
    actor: AuthenticatedUser,
    areaId: string,
    dto: AssignSupervisorDTO,
  ): Promise<ActiveAssignmentItem> {
    assertCanManageArea(actor, "Hanya Owner atau Admin yang dapat menugaskan supervisor.");

    const existing = await AreaRepository.findById(areaId);
    if (!existing) {
      throw new ResponseError("RESOURCE_NOT_FOUND", "Area tidak ditemukan.");
    }
    assertProjectMutable(existing.project);
    await assertActiveSupervisor(dto.supervisorId);

    const active = existing.activeAssignment;
    const previousEndDate = resolvePreviousAssignmentEndDate(active, dto);

    return AreaRepository.replaceSupervisorAssignment({
      areaId,
      activeAssignmentId: active?.id,
      previousEndDate,
      newSupervisorId: dto.supervisorId,
      effectiveStartDate: parseDateOnlyUtc(dto.effectiveStartDate),
      assignedById: actor.id,
    });
  }

  /** Mengambil riwayat kronologis penugasan supervisor pada suatu area (US-06, BR-10). */
  static async getAssignmentHistory(
    actor: AuthenticatedUser,
    areaId: string,
  ): Promise<AssignmentHistoryItem[]> {
    assertCanManageArea(actor, "Hanya Owner atau Admin yang dapat melihat riwayat penugasan.");

    const existing = await AreaRepository.findById(areaId);
    if (!existing) {
      throw new ResponseError("RESOURCE_NOT_FOUND", "Area tidak ditemukan.");
    }
    return AreaRepository.findAssignmentHistory(areaId);
  }
}
