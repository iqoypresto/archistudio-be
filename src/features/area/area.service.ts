import { addDaysToDateString, parseDateOnlyUtc } from "../../helpers/date.helper.js";
import type { AuthenticatedUser } from "../../types/express.d.js";
import { ResponseError } from "../../utils/errors/response-error.util.js";
import { ProjectRepository } from "../project/project.repository.js";
import { UserRepository } from "../user/user.repository.js";
import { AreaRepository } from "./area.repository.js";
import type {
  ActiveAssignmentItem,
  AreaListItem,
  AssignSupervisorDTO,
  AssignmentHistoryItem,
  CreateAreaDTO,
  UpdateAreaDTO,
} from "./area.type.js";

export class AreaService {
  /** Mengambil daftar area dalam suatu project (US-05, BR-03). */
  static async getAreasByProject(
    actor: AuthenticatedUser,
    projectId: string,
  ): Promise<AreaListItem[]> {
    const project = await ProjectRepository.findById(projectId);
    if (!project) {
      throw new ResponseError("RESOURCE_NOT_FOUND", "Project tidak ditemukan.");
    }

    const supervisorUserId = actor.role === "SUPERVISOR" ? actor.id : undefined;
    return AreaRepository.findManyByProjectId(projectId, supervisorUserId);
  }

  /** Membuat Area baru dan menetapkan supervisor aktif awal (US-05, AC-05.1, BR-08, BR-13). */
  static async createArea(
    actor: AuthenticatedUser,
    projectId: string,
    dto: CreateAreaDTO,
  ): Promise<AreaListItem> {
    if (actor.role !== "OWNER" && actor.role !== "ADMIN") {
      throw new ResponseError("FORBIDDEN", "Hanya Owner atau Admin yang dapat menambahkan area.");
    }

    const project = await ProjectRepository.findById(projectId);
    if (!project) {
      throw new ResponseError("RESOURCE_NOT_FOUND", "Project tidak ditemukan.");
    }

    const codeExists = await AreaRepository.findByCodeInProject(projectId, dto.code);
    if (codeExists) {
      throw new ResponseError("CONFLICT", "Kode area sudah digunakan pada project ini.");
    }

    const supervisor = await UserRepository.findById(dto.initialSupervisorId);
    if (!supervisor || !supervisor.isActive || supervisor.role !== "SUPERVISOR") {
      throw new ResponseError("SUPERVISOR_NOT_ACTIVE");
    }

    const startDate = parseDateOnlyUtc(dto.startDate);

    return AreaRepository.createWithInitialAssignment({
      projectId,
      code: dto.code,
      name: dto.name,
      supervisorId: dto.initialSupervisorId,
      startDate,
      assignedById: actor.id,
    });
  }

  /** Memperbarui kode atau nama area (US-05, BR-13). */
  static async updateArea(
    actor: AuthenticatedUser,
    areaId: string,
    dto: UpdateAreaDTO,
  ): Promise<AreaListItem> {
    if (actor.role !== "OWNER" && actor.role !== "ADMIN") {
      throw new ResponseError("FORBIDDEN", "Hanya Owner atau Admin yang dapat mengubah area.");
    }

    const existing = await AreaRepository.findById(areaId);
    if (!existing) {
      throw new ResponseError("RESOURCE_NOT_FOUND", "Area tidak ditemukan.");
    }

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

  /** Menugaskan atau mengganti supervisor aktif suatu area (US-06, AC-06.1, BR-08, BR-10). */
  static async assignSupervisor(
    actor: AuthenticatedUser,
    areaId: string,
    dto: AssignSupervisorDTO,
  ): Promise<ActiveAssignmentItem> {
    if (actor.role !== "OWNER" && actor.role !== "ADMIN") {
      throw new ResponseError("FORBIDDEN", "Hanya Owner atau Admin yang dapat menugaskan supervisor.");
    }

    const existing = await AreaRepository.findById(areaId);
    if (!existing) {
      throw new ResponseError("RESOURCE_NOT_FOUND", "Area tidak ditemukan.");
    }

    const supervisor = await UserRepository.findById(dto.supervisorId);
    if (!supervisor || !supervisor.isActive || supervisor.role !== "SUPERVISOR") {
      throw new ResponseError("SUPERVISOR_NOT_ACTIVE");
    }

    let previousEndDate: Date | undefined;
    const active = existing.activeAssignment;

    if (active) {
      const currentStartStr = active.startDate.toISOString().slice(0, 10);
      if (dto.effectiveStartDate <= currentStartStr) {
        throw new ResponseError("INVALID_ASSIGNMENT_DATE");
      }
      const previousEndDateStr = addDaysToDateString(dto.effectiveStartDate, -1);
      previousEndDate = parseDateOnlyUtc(previousEndDateStr);
    }

    const effectiveStartDate = parseDateOnlyUtc(dto.effectiveStartDate);

    return AreaRepository.replaceSupervisorAssignment({
      areaId,
      activeAssignmentId: active?.id,
      previousEndDate,
      newSupervisorId: dto.supervisorId,
      effectiveStartDate,
      assignedById: actor.id,
    });
  }

  /** Mengambil riwayat kronologis penugasan supervisor pada suatu area (US-06, BR-10). */
  static async getAssignmentHistory(
    actor: AuthenticatedUser,
    areaId: string,
  ): Promise<AssignmentHistoryItem[]> {
    if (actor.role !== "OWNER" && actor.role !== "ADMIN") {
      throw new ResponseError(
        "FORBIDDEN",
        "Hanya Owner atau Admin yang dapat melihat riwayat penugasan.",
      );
    }

    const existing = await AreaRepository.findById(areaId);
    if (!existing) {
      throw new ResponseError("RESOURCE_NOT_FOUND", "Area tidak ditemukan.");
    }

    return AreaRepository.findAssignmentHistory(areaId);
  }
}
