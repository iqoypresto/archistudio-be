import { parseDateOnlyUtc } from "../../helpers/date.helper.js";
import { PaginationHelper } from "../../helpers/pagination.helper.js";
import type { AuthenticatedUser } from "../../types/express.d.js";
import { ResponseError } from "../../utils/errors/response-error.util.js";
import { ProjectRepository } from "./project.repository.js";
import type {
  CreateProjectDTO,
  GetProjectsQuery,
  ProjectDetail,
  ProjectListItem,
  UpdateProjectDTO,
} from "./project.type.js";

export class ProjectService {
  /** Mengambil daftar project dengan paginasi dan filter RBAC (US-04, BR-03). */
  static async getProjects(actor: AuthenticatedUser, query: GetProjectsQuery) {
    const { page, pageSize, skip, take } = PaginationHelper.getSkipTake(
      query.page,
      query.pageSize,
    );

    const supervisorUserId = actor.role === "SUPERVISOR" ? actor.id : undefined;

    const [projects, total] = await ProjectRepository.findManyAndCount({
      skip,
      take,
      search: query.search,
      status: query.status,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      supervisorUserId,
    });

    return {
      projects,
      meta: PaginationHelper.buildMeta(page, pageSize, total),
    };
  }

  /** Mengambil detail project dengan verifikasi hak akses area (US-04, BR-03). */
  static async getProjectById(
    actor: AuthenticatedUser,
    id: string,
  ): Promise<ProjectDetail> {
    if (actor.role === "SUPERVISOR") {
      const allowed = await ProjectRepository.findById(id, actor.id);
      if (!allowed) {
        const anyProject = await ProjectRepository.findById(id);
        if (!anyProject) {
          throw new ResponseError("RESOURCE_NOT_FOUND", "Project tidak ditemukan.");
        }
        throw new ResponseError(
          "AREA_SCOPE_FORBIDDEN",
          "Anda hanya dapat mengakses project yang ditugaskan kepada Anda.",
        );
      }
      return allowed;
    }

    const project = await ProjectRepository.findById(id);
    if (!project) {
      throw new ResponseError("RESOURCE_NOT_FOUND", "Project tidak ditemukan.");
    }
    return project;
  }

  /** Membuat master project baru (US-04, AC-04.1, BR-07, BR-11, BR-13). */
  static async createProject(
    actor: AuthenticatedUser,
    dto: CreateProjectDTO,
  ): Promise<ProjectListItem> {
    if (actor.role !== "OWNER" && actor.role !== "ADMIN") {
      throw new ResponseError("FORBIDDEN", "Hanya Owner atau Admin yang dapat membuat project.");
    }

    if (dto.endDate && dto.endDate < dto.startDate) {
      throw new ResponseError("INVALID_PROJECT_DATES");
    }

    const codeExists = await ProjectRepository.findByCode(dto.code);
    if (codeExists) {
      throw new ResponseError("CONFLICT", "Kode project sudah digunakan.");
    }

    const startDate = parseDateOnlyUtc(dto.startDate);
    const endDate = dto.endDate ? parseDateOnlyUtc(dto.endDate) : null;

    return ProjectRepository.create({
      code: dto.code,
      name: dto.name,
      location: dto.location,
      clientName: dto.clientName,
      startDate,
      endDate,
      status: dto.status,
      timezone: dto.timezone,
      routineHolidays: dto.routineHolidays,
    });
  }

  /** Memperbarui data project (US-04, BR-07, BR-11, BR-13). */
  static async updateProject(
    actor: AuthenticatedUser,
    id: string,
    dto: UpdateProjectDTO,
  ): Promise<ProjectListItem> {
    if (actor.role !== "OWNER" && actor.role !== "ADMIN") {
      throw new ResponseError("FORBIDDEN", "Hanya Owner atau Admin yang dapat mengubah project.");
    }

    const existing = await ProjectRepository.findById(id);
    if (!existing) {
      throw new ResponseError("RESOURCE_NOT_FOUND", "Project tidak ditemukan.");
    }

    if (dto.code && dto.code !== existing.code) {
      const codeExists = await ProjectRepository.findByCode(dto.code, id);
      if (codeExists) {
        throw new ResponseError("CONFLICT", "Kode project sudah digunakan.");
      }
    }

    const currentStart = existing.startDate.toISOString().slice(0, 10);
    const currentEnd = existing.endDate ? existing.endDate.toISOString().slice(0, 10) : null;
    const effectiveStart = dto.startDate ?? currentStart;
    const effectiveEnd = dto.endDate !== undefined ? dto.endDate : currentEnd;

    if (effectiveEnd && effectiveEnd < effectiveStart) {
      throw new ResponseError("INVALID_PROJECT_DATES");
    }

    return ProjectRepository.update(id, {
      ...(dto.code && { code: dto.code }),
      ...(dto.name && { name: dto.name }),
      ...(dto.location && { location: dto.location }),
      ...(dto.clientName && { clientName: dto.clientName }),
      ...(dto.startDate && { startDate: parseDateOnlyUtc(dto.startDate) }),
      ...(dto.endDate !== undefined && {
        endDate: dto.endDate ? parseDateOnlyUtc(dto.endDate) : null,
      }),
      ...(dto.status && { status: dto.status }),
      ...(dto.timezone && { timezone: dto.timezone }),
      ...(dto.routineHolidays && { routineHolidays: dto.routineHolidays }),
    });
  }

  /** Mengarsipkan project secara soft-delete (BR-05, NFR-05). */
  static async archiveProject(
    actor: AuthenticatedUser,
    id: string,
  ): Promise<{ id: string; deletedAt: Date }> {
    if (actor.role !== "OWNER" && actor.role !== "ADMIN") {
      throw new ResponseError("FORBIDDEN", "Hanya Owner atau Admin yang dapat mengarsipkan project.");
    }

    const existing = await ProjectRepository.findById(id);
    if (!existing) {
      throw new ResponseError("RESOURCE_NOT_FOUND", "Project tidak ditemukan.");
    }

    return ProjectRepository.archive(id);
  }
}
