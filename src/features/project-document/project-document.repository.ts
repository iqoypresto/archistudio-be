import type { ProjectDocumentType } from "@prisma/client";
import { prisma } from "../../configs/prisma-client.config.js";
import {
  projectDocumentSelect,
  projectDocumentWithProjectSelect,
  type RawProjectDocument,
  type RawProjectDocumentWithProject,
} from "./project-document.helper.js";

export class ProjectDocumentRepository {
  /** Mengambil daftar dokumen keluar project menurut kategori opsional (US-19, BR-34). */
  static async findManyByProject(params: {
    projectId: string;
    type?: ProjectDocumentType;
  }): Promise<RawProjectDocument[]> {
    return prisma.projectDocument.findMany({
      where: {
        projectId: params.projectId,
        ...(params.type && { type: params.type }),
      },
      select: projectDocumentSelect,
      orderBy: { storedFile: { uploadedAt: "desc" } },
    });
  }

  /** Mengambil satu dokumen keluar beserta status project induk. */
  static async findByIdWithProject(id: string): Promise<RawProjectDocumentWithProject | null> {
    return prisma.projectDocument.findUnique({
      where: { id },
      select: projectDocumentWithProjectSelect,
    });
  }

  /** Menyimpan metadata file dokumen keluar baru (US-19, BR-34). */
  static async create(data: {
    projectId: string;
    type: ProjectDocumentType;
    storedFileId: string;
  }): Promise<RawProjectDocument> {
    return prisma.projectDocument.create({
      data,
      select: projectDocumentSelect,
    });
  }

  /** Menghapus permanen record dokumen keluar dari database (US-19, BR-34). */
  static async deleteAndQueueFile(id: string): Promise<string> {
    return prisma.$transaction(async (tx) => {
      const document = await tx.projectDocument.findUniqueOrThrow({ where: { id }, select: { storedFileId: true } });
      await tx.projectDocument.delete({ where: { id } });
      await tx.storedFile.update({ where: { id: document.storedFileId }, data: { status: "DELETE_PENDING" } });
      return document.storedFileId;
    });
  }

  static markFileDeleted(storedFileId: string) {
    return prisma.storedFile.update({ where: { id: storedFileId }, data: { status: "DELETED" } });
  }
}
