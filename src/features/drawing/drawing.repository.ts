import type { DrawingDirection } from "@prisma/client";
import { prisma } from "../../configs/prisma-client.config.js";
import {
  drawingSelect,
  drawingWithProjectSelect,
  type RawDrawingRecord,
  type RawDrawingWithProject,
} from "./drawing.helper.js";

export class DrawingRepository {
  /** Mengambil daftar Drawing pada satu project (US-18, BR-32). */
  static async findManyByProject(params: {
    projectId: string;
    direction?: DrawingDirection;
    includeArchived?: boolean;
  }): Promise<RawDrawingRecord[]> {
    return prisma.drawing.findMany({
      where: {
        projectId: params.projectId,
        ...(params.direction && { direction: params.direction }),
        ...(!params.includeArchived && { archivedAt: null }),
      },
      select: drawingSelect,
      orderBy: { uploadedAt: "desc" },
    });
  }

  /** Mengambil satu Drawing beserta status project induk. */
  static async findByIdWithProject(id: string): Promise<RawDrawingWithProject | null> {
    return prisma.drawing.findUnique({
      where: { id },
      select: drawingWithProjectSelect,
    });
  }

  /** Menyimpan metadata Drawing baru setelah direct upload ke R2 (US-18, BR-32, BR-33). */
  static async create(data: {
    projectId: string;
    direction: DrawingDirection;
    storageKey: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
  }): Promise<RawDrawingRecord> {
    return prisma.drawing.create({
      data,
      select: drawingSelect,
    });
  }

  /** Mengarsipkan Drawing (menetapkan archivedAt tanpa menghapus riwayat) (US-18, BR-32). */
  static async markArchived(id: string, archivedAt: Date): Promise<RawDrawingRecord> {
    return prisma.drawing.update({
      where: { id },
      data: { archivedAt },
      select: drawingSelect,
    });
  }
}
