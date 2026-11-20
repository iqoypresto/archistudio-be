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
      orderBy: { uploadedAt: "desc" },
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
    storageKey: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
  }): Promise<RawProjectDocument> {
    return prisma.projectDocument.create({
      data,
      select: projectDocumentSelect,
    });
  }

  /** Menghapus permanen record dokumen keluar dari database (US-19, BR-34). */
  static async deleteById(id: string): Promise<void> {
    await prisma.projectDocument.delete({ where: { id } });
  }
}
