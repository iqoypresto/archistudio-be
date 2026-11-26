import { PaginationHelper } from "../../helpers/pagination.helper.js";
import type { AuthenticatedUser } from "../../types/express.d.js";
import { hashPassword } from "../../utils/auth/bcrypt.util.js";
import { ResponseError } from "../../utils/errors/response-error.util.js";
import { UserRepository } from "./user.repository.js";
import type {
  CreateUserDTO,
  GetUsersQuery,
  ResetPasswordDTO,
  ToggleStatusDTO,
  UpdateUserDTO,
  UserListItem,
} from "./user.type.js";

export class UserService {
  /** Mengambil daftar pengguna dengan filter, paginasi, dan ringkasan global (US-02, US-03). */
  static async getUsers(query: GetUsersQuery) {
    const { page, pageSize, skip, take } = PaginationHelper.getSkipTake(
      query.page,
      query.pageSize,
    );

    const [[users, total], summary] = await Promise.all([
      UserRepository.findManyAndCount({
        skip,
        take,
        search: query.search,
        role: query.role,
        isActive: query.isActive,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
      }),
      UserRepository.getGlobalSummary(),
    ]);

    return {
      users,
      meta: PaginationHelper.buildMeta(page, pageSize, total),
      summary,
    };
  }

  /** Membuat akun pengguna baru (BR-01, BR-02, BR-04, BR-06). */
  static async createUser(
    actor: AuthenticatedUser,
    dto: CreateUserDTO,
  ): Promise<UserListItem> {
    if (actor.role === "ADMIN" && dto.role !== "SUPERVISOR") {
      throw new ResponseError(
        "FORBIDDEN",
        "Admin hanya berwenang membuat akun dengan peran Supervisor.",
      );
    }

    const conflict = await UserRepository.findConflict(dto.username, dto.phone);
    if (conflict.usernameExists) {
      throw new ResponseError("CONFLICT", "Username sudah terdaftar.");
    }
    if (conflict.phoneExists) {
      throw new ResponseError("CONFLICT", "Nomor HP sudah terdaftar.");
    }

    const passwordHash = await hashPassword(dto.password);
    const defaultJobTitle =
      dto.role === "SUPERVISOR"
        ? "Supervisor"
        : dto.role === "SITE_MANAGER"
          ? "Site Manager"
          : "Admin";
    const jobTitle = dto.jobTitle?.trim() || defaultJobTitle;

    return UserRepository.create({
      name: dto.name,
      username: dto.username.toLowerCase(),
      phone: dto.phone,
      passwordHash,
      role: dto.role,
      jobTitle,
    });
  }

  /** Memperbarui profil atau peran pengguna (BR-01, BR-02). */
  static async updateUser(
    actor: AuthenticatedUser,
    targetId: string,
    dto: UpdateUserDTO,
  ): Promise<UserListItem> {
    const target = await UserRepository.findById(targetId);
    if (!target) {
      throw new ResponseError("RESOURCE_NOT_FOUND", "Pengguna tidak ditemukan.");
    }

    if (actor.role === "ADMIN") {
      if (target.role !== "SUPERVISOR") {
        throw new ResponseError(
          "FORBIDDEN",
          "Admin tidak berwenang mengubah akun Owner, Admin, atau Site Manager.",
        );
      }
      if (dto.role && dto.role !== "SUPERVISOR") {
        throw new ResponseError(
          "FORBIDDEN",
          "Admin tidak dapat mengubah peran menjadi selain Supervisor.",
        );
      }
    }

    if (dto.role !== undefined && dto.role !== target.role) {
      if (target.role === "OWNER") {
        throw new ResponseError("FORBIDDEN", "Peran akun Owner tidak dapat diubah.");
      }
      if (actor.id === targetId) {
        throw new ResponseError("FORBIDDEN", "Anda tidak dapat mengubah peran akun Anda sendiri.");
      }
    }

    if (dto.username || dto.phone) {
      const conflict = await UserRepository.findConflict(
        dto.username?.toLowerCase(),
        dto.phone,
        targetId,
      );
      if (conflict.usernameExists) {
        throw new ResponseError("CONFLICT", "Username sudah digunakan.");
      }
      if (conflict.phoneExists) {
        throw new ResponseError("CONFLICT", "Nomor HP sudah digunakan.");
      }
    }

    return UserRepository.update(targetId, {
      ...(dto.name && { name: dto.name }),
      ...(dto.username && { username: dto.username.toLowerCase() }),
      ...(dto.phone && { phone: dto.phone }),
      ...(dto.role && { role: dto.role }),
      ...(dto.jobTitle !== undefined && { jobTitle: dto.jobTitle }),
    });
  }

  /** Me-reset kata sandi manual oleh Owner/Admin (BR-04). */
  static async resetPassword(
    actor: AuthenticatedUser,
    targetId: string,
    dto: ResetPasswordDTO,
  ): Promise<UserListItem> {
    const target = await UserRepository.findById(targetId);
    if (!target) {
      throw new ResponseError("RESOURCE_NOT_FOUND", "Pengguna tidak ditemukan.");
    }

    if (actor.role === "ADMIN" && target.role !== "SUPERVISOR") {
      throw new ResponseError(
        "FORBIDDEN",
        "Admin hanya berwenang mereset kata sandi akun Supervisor.",
      );
    }

    const passwordHash = await hashPassword(dto.newPassword);
    return UserRepository.resetPasswordAndRevokeTokens(targetId, passwordHash);
  }

  /** Mengubah status aktif/nonaktif akun (BR-05). */
  static async toggleStatus(
    actor: AuthenticatedUser,
    targetId: string,
    dto: ToggleStatusDTO,
  ): Promise<UserListItem> {
    if (actor.id === targetId) {
      throw new ResponseError(
        "FORBIDDEN",
        "Anda tidak dapat menonaktifkan akun Anda sendiri.",
      );
    }

    const target = await UserRepository.findById(targetId);
    if (!target) {
      throw new ResponseError("RESOURCE_NOT_FOUND", "Pengguna tidak ditemukan.");
    }

    if (actor.role === "ADMIN" && target.role !== "SUPERVISOR") {
      throw new ResponseError(
        "FORBIDDEN",
        "Admin hanya berwenang mengubah status akun Supervisor.",
      );
    }

    return UserRepository.setStatusAndRevokeTokens(targetId, dto.isActive);
  }
}
