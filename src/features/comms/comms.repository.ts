import type { CommsDirection, Prisma } from "@prisma/client";
import { prisma } from "../../configs/prisma-client.config.js";
import {
  commsSelect,
  commsWithProjectSelect,
  type RawCommsEntry,
  type RawCommsWithProject,
} from "./comms.helper.js";

export class CommsRepository {
  /** Mengambil daftar catatan Comms dalam satu project dengan filter tanggal/arah (US-20, BR-35). */
  static async findManyByProject(params: {
    projectId: string;
    dateFrom?: Date;
    dateTo?: Date;
    direction?: CommsDirection;
    search?: string;
  }): Promise<RawCommsEntry[]> {
    const where: Prisma.CommsEntryWhereInput = {
      projectId: params.projectId,
      ...(params.direction && { direction: params.direction }),
      ...((params.dateFrom || params.dateTo) && {
        entryDate: {
          ...(params.dateFrom && { gte: params.dateFrom }),
          ...(params.dateTo && { lte: params.dateTo }),
        },
      }),
      ...(params.search && {
        OR: [
          { subject: { contains: params.search, mode: "insensitive" } },
          { note: { contains: params.search, mode: "insensitive" } },
        ],
      }),
    };

    return prisma.commsEntry.findMany({
      where,
      select: commsSelect,
      orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
    });
  }

  /** Mengambil satu catatan Comms beserta status project induk. */
  static async findByIdWithProject(id: string): Promise<RawCommsWithProject | null> {
    return prisma.commsEntry.findUnique({
      where: { id },
      select: commsWithProjectSelect,
    });
  }

  /** Menyimpan catatan Comms baru beserta audit pencatat (US-20, BR-35, D-05). */
  static async create(data: {
    projectId: string;
    direction: CommsDirection;
    entryDate: Date;
    subject: string;
    note: string | null;
    attachmentKey: string | null;
    attachmentName: string | null;
    attachmentMime: string | null;
    attachmentBytes: number | null;
    createdById: string;
  }): Promise<RawCommsEntry> {
    return prisma.commsEntry.create({ data, select: commsSelect });
  }

  /** Memperbarui catatan Comms yang ada (US-20, BR-35). */
  static async update(id: string, data: Prisma.CommsEntryUpdateInput): Promise<RawCommsEntry> {
    return prisma.commsEntry.update({ where: { id }, data, select: commsSelect });
  }
}
