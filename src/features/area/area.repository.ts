import { prisma } from "../../configs/prisma-client.config.js";
import type {
  ActiveAssignmentItem,
  AreaListItem,
  AssignmentHistoryItem,
} from "./area.type.js";

const supervisorSelect = {
  id: true,
  name: true,
  username: true,
  phone: true,
  jobTitle: true,
} as const;

const assignmentSelect = {
  id: true,
  supervisorId: true,
  startDate: true,
  endDate: true,
  supervisor: { select: supervisorSelect },
} as const;

const areaSelect = {
  id: true,
  projectId: true,
  code: true,
  name: true,
  createdAt: true,
  updatedAt: true,
  assignments: {
    where: { endDate: null },
    take: 1,
    select: assignmentSelect,
  },
} as const;

type RawAreaItem = AreaListItem & { assignments: ActiveAssignmentItem[] };

function formatArea(raw: RawAreaItem): AreaListItem {
  const { assignments, ...rest } = raw;
  return { ...rest, activeAssignment: assignments[0] ?? null };
}

export class AreaRepository {
  /** Mengambil daftar area dalam project beserta penugasan aktif (BR-03, US-05). */
  static async findManyByProjectId(
    projectId: string,
    supervisorUserId?: string,
  ): Promise<AreaListItem[]> {
    const areas = await prisma.area.findMany({
      where: {
        projectId,
        deletedAt: null,
        ...(supervisorUserId && {
          assignments: { some: { supervisorId: supervisorUserId } },
        }),
      },
      select: areaSelect,
      orderBy: { code: "asc" },
    });
    return (areas as RawAreaItem[]).map(formatArea);
  }

  /** Mengambil satu area berdasarkan ID beserta penugasan aktifnya. */
  static async findById(areaId: string): Promise<AreaListItem | null> {
    const area = await prisma.area.findFirst({
      where: { id: areaId, deletedAt: null },
      select: areaSelect,
    });
    return area ? formatArea(area as RawAreaItem) : null;
  }

  /** Memeriksa duplikasi kode area dalam project yang sama (BR-13). */
  static async findByCodeInProject(
    projectId: string,
    code: string,
    excludeAreaId?: string,
  ): Promise<boolean> {
    const count = await prisma.area.count({
      where: {
        projectId,
        code,
        deletedAt: null,
        ...(excludeAreaId && { id: { not: excludeAreaId } }),
      },
    });
    return count > 0;
  }

  /** Transaksi atomik: Membuat Area baru beserta penugasan aktif awal (US-05, BR-08, BR-13). */
  static async createWithInitialAssignment(data: {
    projectId: string;
    code: string;
    name: string;
    supervisorId: string;
    startDate: Date;
    assignedById: string;
  }): Promise<AreaListItem> {
    return prisma.$transaction(async (tx) => {
      const area = await tx.area.create({
        data: { projectId: data.projectId, code: data.code, name: data.name },
      });

      const assignment = await tx.areaAssignment.create({
        data: {
          areaId: area.id,
          supervisorId: data.supervisorId,
          startDate: data.startDate,
          endDate: null,
          assignedById: data.assignedById,
        },
        select: assignmentSelect,
      });

      return {
        id: area.id,
        projectId: area.projectId,
        code: area.code,
        name: area.name,
        createdAt: area.createdAt,
        updatedAt: area.updatedAt,
        activeAssignment: assignment as ActiveAssignmentItem,
      };
    });
  }

  /** Memperbarui data area (kode / nama). */
  static async update(
    areaId: string,
    data: { code?: string; name?: string },
  ): Promise<AreaListItem> {
    const updated = await prisma.area.update({
      where: { id: areaId },
      data,
      select: areaSelect,
    });
    return formatArea(updated as RawAreaItem);
  }

  /** Transaksi atomik: Mengganti supervisor aktif (tutup penugasan lama H-1 & buat baru) (US-06, BR-08, BR-10). */
  static async replaceSupervisorAssignment(data: {
    areaId: string;
    activeAssignmentId?: string;
    previousEndDate?: Date;
    newSupervisorId: string;
    effectiveStartDate: Date;
    assignedById: string;
  }): Promise<ActiveAssignmentItem> {
    return prisma.$transaction(async (tx) => {
      if (data.activeAssignmentId && data.previousEndDate) {
        await tx.areaAssignment.update({
          where: { id: data.activeAssignmentId },
          data: { endDate: data.previousEndDate },
        });
      }

      const created = await tx.areaAssignment.create({
        data: {
          areaId: data.areaId,
          supervisorId: data.newSupervisorId,
          startDate: data.effectiveStartDate,
          endDate: null,
          assignedById: data.assignedById,
        },
        select: assignmentSelect,
      });

      return created as ActiveAssignmentItem;
    });
  }

  /** Mengambil riwayat kronologis penugasan supervisor pada suatu area (US-06, BR-10). */
  static async findAssignmentHistory(areaId: string): Promise<AssignmentHistoryItem[]> {
    const list = await prisma.areaAssignment.findMany({
      where: { areaId },
      select: {
        id: true,
        areaId: true,
        supervisorId: true,
        startDate: true,
        endDate: true,
        createdAt: true,
        supervisor: { select: supervisorSelect },
        assignedBy: { select: { id: true, name: true } },
      },
      orderBy: { startDate: "desc" },
    });
    return list as AssignmentHistoryItem[];
  }
}
