import { parseDateOnlyUtc } from "../../helpers/date.helper.js";
import { PaginationHelper } from "../../helpers/pagination.helper.js";
import type { AuthenticatedUser } from "../../types/express.d.js";
import { ResponseError } from "../../utils/errors/response-error.util.js";
import {
  assertOwnerProjectAction,
  assertProjectNotArchived,
  isProjectInArchive,
  mapToArchivedProjectItem,
} from "./project.helper.js";
import { ProjectRepository } from "./project.repository.js";
import type {
  ArchivedProjectItem,
  CreateProjectDTO,
  GetArchiveQuery,
  GetProjectsQuery,
  ProjectDetail,
  ProjectListItem,
  RestoreProjectDTO,
  UpdateProjectDTO,
} from "./project.type.js";

function assertManagerRole(actor: AuthenticatedUser, message: string): void {
  if (actor.role !== "OWNER" && actor.role !== "ADMIN") {
    throw new ResponseError("FORBIDDEN", message);
  }
}

export class ProjectService {
  /** Mengambil daftar project aktif dengan paginasi dan filter RBAC (US-04, BR-03, BR-39). */
  static async getProjects(actor: AuthenticatedUser, query: GetProjectsQuery) {
    const { page, pageSize, skip, take } = PaginationHelper.getSkipTake(query.page, query.pageSize);
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
    return { projects, meta: PaginationHelper.buildMeta(page, pageSize, total) };
  }

  /** Mengambil daftar Archive Project (SELESAI & arsip manual) untuk OWNER/ADMIN (US-22, BR-39). */
  static async getArchivedProjects(
    actor: AuthenticatedUser,
    query: GetArchiveQuery,
  ): Promise<ArchivedProjectItem[]> {
    assertManagerRole(actor, "Hanya Owner atau Admin yang dapat melihat Archive Project.");
    const projects = await ProjectRepository.findArchived(query.search);
    const mapped = projects
      .map(mapToArchivedProjectItem)
      .sort((a, b) => b.archivedActionAt.getTime() - a.archivedActionAt.getTime());

    return query.year ? mapped.filter((item) => item.archiveYear === query.year) : mapped;
  }

  /** Mengambil detail project dengan verifikasi hak akses role (US-04, BR-03, BR-39). */
  static async getProjectById(actor: AuthenticatedUser, id: string): Promise<ProjectDetail> {
    if (actor.role === "SUPERVISOR") {
      const allowed = await ProjectRepository.findById(id, actor.id);
      if (allowed) return allowed;
      const anyProject = await ProjectRepository.findById(id);
      if (!anyProject) throw new ResponseError("RESOURCE_NOT_FOUND", "Project tidak ditemukan.");
      throw new ResponseError(
        "AREA_SCOPE_FORBIDDEN",
        "Anda hanya dapat mengakses project aktif yang ditugaskan kepada Anda.",
      );
    }

    const project = await ProjectRepository.findById(id);
    if (!project) throw new ResponseError("RESOURCE_NOT_FOUND", "Project tidak ditemukan.");
    return project;
  }

  /** Membuat master project baru (US-04, AC-04.1, BR-07, BR-11, BR-13). */
  static async createProject(
    actor: AuthenticatedUser,
    dto: CreateProjectDTO,
  ): Promise<ProjectListItem> {
    assertManagerRole(actor, "Hanya Owner atau Admin yang dapat membuat project.");
    if (dto.endDate && dto.endDate < dto.startDate) throw new ResponseError("INVALID_PROJECT_DATES");
    if (await ProjectRepository.findByCode(dto.code)) {
      throw new ResponseError("CONFLICT", "Kode project sudah digunakan.");
    }

    return ProjectRepository.create({
      code: dto.code,
      name: dto.name,
      location: dto.location,
      clientName: dto.clientName,
      startDate: parseDateOnlyUtc(dto.startDate),
      endDate: dto.endDate ? parseDateOnlyUtc(dto.endDate) : null,
      status: dto.status,
      timezone: dto.timezone,
      routineHolidays: dto.routineHolidays,
    });
  }

  /** Memperbarui data project aktif (US-04, BR-07, BR-11, BR-12, BR-39). */
  static async updateProject(
    actor: AuthenticatedUser,
    id: string,
    dto: UpdateProjectDTO,
  ): Promise<ProjectListItem> {
    assertManagerRole(actor, "Hanya Owner atau Admin yang dapat mengubah project.");
    const existing = await ProjectRepository.findById(id);
    if (!existing) throw new ResponseError("RESOURCE_NOT_FOUND", "Project tidak ditemukan.");
    assertProjectNotArchived(existing);

    if (dto.code && dto.code !== existing.code && (await ProjectRepository.findByCode(dto.code, id))) {
      throw new ResponseError("CONFLICT", "Kode project sudah digunakan.");
    }

    const effectiveStart = dto.startDate ?? existing.startDate.toISOString().slice(0, 10);
    const currentEnd = existing.endDate ? existing.endDate.toISOString().slice(0, 10) : null;
    const effectiveEnd = dto.endDate !== undefined ? dto.endDate : currentEnd;
    if (effectiveEnd && effectiveEnd < effectiveStart) throw new ResponseError("INVALID_PROJECT_DATES");

    return ProjectRepository.update(id, {
      ...(dto.code && { code: dto.code }),
      ...(dto.name && { name: dto.name }),
      ...(dto.location && { location: dto.location }),
      ...(dto.clientName && { clientName: dto.clientName }),
      ...(dto.startDate && { startDate: parseDateOnlyUtc(dto.startDate) }),
      ...(dto.endDate !== undefined && { endDate: dto.endDate ? parseDateOnlyUtc(dto.endDate) : null }),
      ...(dto.status && { status: dto.status }),
      ...(dto.timezone && { timezone: dto.timezone }),
      ...(dto.routineHolidays && { routineHolidays: dto.routineHolidays }),
    });
  }

  /** Menandai project SELESAI & otomatis masuk Archive menurut tahun tindakan (US-22, BR-12, BR-39). */
  static async completeProject(
    actor: AuthenticatedUser,
    id: string,
    now = new Date(),
  ): Promise<ProjectListItem> {
    assertOwnerProjectAction(actor, "Hanya Owner yang dapat menandai project selesai.");
    const existing = await ProjectRepository.findById(id);
    if (!existing) throw new ResponseError("RESOURCE_NOT_FOUND", "Project tidak ditemukan.");
    assertProjectNotArchived(existing);
    return ProjectRepository.markCompleted(id, now);
  }

  /** Mengarsipkan project secara manual oleh Owner (US-22, BR-39). */
  static async archiveProject(
    actor: AuthenticatedUser,
    id: string,
    now = new Date(),
  ): Promise<ProjectListItem> {
    assertOwnerProjectAction(actor, "Hanya Owner yang dapat mengarsipkan project.");
    const existing = await ProjectRepository.findById(id);
    if (!existing) throw new ResponseError("RESOURCE_NOT_FOUND", "Project tidak ditemukan.");
    assertProjectNotArchived(existing);
    return ProjectRepository.markArchived(id, now);
  }

  /** Memulihkan project dari Archive ke status PERSIAPAN atau BERJALAN oleh Owner (US-22, BR-39). */
  static async restoreProject(
    actor: AuthenticatedUser,
    id: string,
    dto: RestoreProjectDTO,
  ): Promise<ProjectListItem> {
    assertOwnerProjectAction(actor, "Hanya Owner yang dapat memulihkan project dari Archive.");
    const existing = await ProjectRepository.findById(id);
    if (!existing) throw new ResponseError("RESOURCE_NOT_FOUND", "Project tidak ditemukan.");
    if (!isProjectInArchive(existing)) {
      throw new ResponseError("CONFLICT", "Project tidak sedang berada di Archive.");
    }
    return ProjectRepository.restoreProject(id, dto.status);
  }
}
