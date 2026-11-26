import { Role, StoredFileStatus } from "@prisma/client";
import type { Readable } from "node:stream";
import type { AuthenticatedUser } from "../../types/express.js";
import { isCommsAllowedRole } from "../../helpers/access-policy.helper.js";
import { ResponseError } from "../../utils/errors/response-error.util.js";
import { streamDriveFile, streamDriveThumbnail } from "../../utils/storage/drive-file.adapter.js";
import { ProjectService } from "../project/project.service.js";
import { FileRepository } from "./file.repository.js";

export type FileContentVariant = "full" | "thumb";

export interface OpenContentOptions {
  variant?: FileContentVariant;
  ifNoneMatch?: string;
}

export type AuthorizedFileContent =
  | { notModified: true; etag: string }
  | {
      notModified: false;
      etag: string;
      stream: Readable;
      fileName: string;
      mimeType: string;
      sizeBytes: number | null;
    };

function matchesIfNoneMatch(headerValue: string | undefined, etag: string): boolean {
  if (!headerValue) return false;
  return headerValue
    .split(",")
    .map((part) => part.trim().replace(/^W\//, ""))
    .some((candidate) => candidate === "*" || candidate === etag);
}

function resolveRequestedVariant(mimeType: string, requested?: FileContentVariant): FileContentVariant {
  return requested === "thumb" && mimeType.startsWith("image/") ? "thumb" : "full";
}

export class FileService {
  static async openContent(
    id: string,
    user: AuthenticatedUser,
    options?: OpenContentOptions,
  ): Promise<AuthorizedFileContent> {
    const file = await FileRepository.findById(id);
    if (!file || file.status !== StoredFileStatus.READY || !file.driveFileId) {
      throw new ResponseError("RESOURCE_NOT_FOUND");
    }
    await FileService.assertCanRead(file, user);
    const variant = resolveRequestedVariant(file.mimeType, options?.variant);
    const expectedEtag = `"${file.id}-${variant}"`;
    if (matchesIfNoneMatch(options?.ifNoneMatch, expectedEtag)) {
      return { notModified: true, etag: expectedEtag };
    }
    return FileService.loadStream(
      { id: file.id, driveFileId: file.driveFileId, fileName: file.fileName, mimeType: file.mimeType, sizeBytes: file.sizeBytes },
      variant,
      expectedEtag,
    );
  }

  private static async loadStream(
    file: { id: string; driveFileId: string; fileName: string; mimeType: string; sizeBytes: number },
    variant: FileContentVariant,
    expectedEtag: string,
  ): Promise<Extract<AuthorizedFileContent, { notModified: false }>> {
    if (variant === "thumb") {
      const thumb = await streamDriveThumbnail(file.driveFileId);
      if (thumb) {
        return {
          notModified: false,
          etag: expectedEtag,
          stream: thumb.body,
          fileName: file.fileName,
          mimeType: thumb.mimeType,
          sizeBytes: thumb.sizeBytes,
        };
      }
    }
    const content = await streamDriveFile(file.driveFileId);
    return {
      notModified: false,
      etag: `"${file.id}-full"`,
      stream: content.body,
      fileName: file.fileName,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
    };
  }

  private static async assertCanRead(
    file: NonNullable<Awaited<ReturnType<typeof FileRepository.findById>>>,
    user: AuthenticatedUser,
  ): Promise<void> {
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

  private static assertReportRead(
    report: {
      supervisorId: string;
      area: { assignments: { supervisorId: string }[]; project: { siteManagerId: string | null } };
    },
    user: AuthenticatedUser,
  ): void {
    if (user.role === Role.OWNER || user.role === Role.ADMIN) return;
    const assigned = report.area.assignments.some((item) => item.supervisorId === user.id);
    const allowed =
      report.supervisorId === user.id ||
      assigned ||
      (user.role === Role.SITE_MANAGER && report.area.project.siteManagerId === user.id);
    if (!allowed) throw new ResponseError("AREA_SCOPE_FORBIDDEN");
  }

  private static assertOwner(role: Role): void {
    if (role !== Role.OWNER) throw new ResponseError("FORBIDDEN");
  }
}
