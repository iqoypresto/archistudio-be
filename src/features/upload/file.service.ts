import { Role, StoredFileStatus } from "@prisma/client";
import type { Readable } from "node:stream";
import type { AuthenticatedUser } from "../../types/express.js";
import { isCommsAllowedRole } from "../../helpers/access-policy.helper.js";
import { ResponseError } from "../../utils/errors/response-error.util.js";
import { streamDriveFile } from "../../utils/storage/drive-file.adapter.js";
import { ProjectService } from "../project/project.service.js";
import { FileRepository } from "./file.repository.js";

export interface AuthorizedFileContent {
  stream: Readable;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export class FileService {
  static async openContent(id: string, user: AuthenticatedUser): Promise<AuthorizedFileContent> {
    const file = await FileRepository.findById(id);
    if (!file || file.status !== StoredFileStatus.READY || !file.driveFileId) throw new ResponseError("RESOURCE_NOT_FOUND");
    await FileService.assertCanRead(file, user);
    const content = await streamDriveFile(file.driveFileId);
    return { stream: content.body, fileName: file.fileName, mimeType: file.mimeType, sizeBytes: file.sizeBytes };
  }

  private static async assertCanRead(file: NonNullable<Awaited<ReturnType<typeof FileRepository.findById>>>, user: AuthenticatedUser): Promise<void> {
    if (file.reportPhoto) return FileService.assertReportRead(file.reportPhoto.report, user);
    if (file.paymentRecord || file.projectDocument) return FileService.assertOwner(user.role);
    if (file.drawing) {
      await ProjectService.assertCanAccessProject(user, file.drawing.projectId);
      return;
    }
    if (file.commsEntry) {
      if (!isCommsAllowedRole(user.role)) throw new ResponseError("FORBIDDEN");
      await ProjectService.assertCanAccessProject(user, file.commsEntry.projectId);
      return;
    }
    throw new ResponseError("RESOURCE_NOT_FOUND");
  }

  private static assertReportRead(report: {
    supervisorId: string;
    area: { assignments: { supervisorId: string }[]; project: { siteManagerId: string | null } };
  }, user: AuthenticatedUser): void {
    if (user.role === Role.OWNER || user.role === Role.ADMIN) return;
    const assigned = report.area.assignments.some((item) => item.supervisorId === user.id);
    const allowed = report.supervisorId === user.id || assigned ||
      (user.role === Role.SITE_MANAGER && report.area.project.siteManagerId === user.id);
    if (!allowed) throw new ResponseError("AREA_SCOPE_FORBIDDEN");
  }

  private static assertOwner(role: Role): void {
    if (role !== Role.OWNER) throw new ResponseError("FORBIDDEN");
  }
}
