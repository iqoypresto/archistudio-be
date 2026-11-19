import { ReportStatus } from "@prisma/client";
import { prisma } from "../../configs/prisma-client.config.js";

export async function fetchProjectPeriod(projectId: string, from: Date, to: Date) {
  return prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: {
      id: true, code: true, name: true, location: true, clientName: true,
      startDate: true, endDate: true, routineHolidays: true,
      areas: {
        where: { deletedAt: null }, orderBy: { code: "asc" },
        select: {
          id: true, code: true, name: true,
          assignments: { select: { startDate: true, endDate: true } },
          reports: {
            where: { reportDate: { gte: from, lte: to }, status: ReportStatus.SUBMITTED },
            orderBy: { reportDate: "asc" },
            include: { photos: { orderBy: { sortOrder: "asc" } } },
          },
        },
      },
    },
  });
}

export async function fetchProjectAndAreas(projectId: string, reportDateUtc: Date) {
  return prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: {
      id: true, code: true, name: true, location: true, clientName: true,
      startDate: true, endDate: true, routineHolidays: true, timezone: true,
      areas: {
        where: { deletedAt: null }, orderBy: { code: "asc" },
        select: {
          id: true, code: true, name: true,
          assignments: { orderBy: { startDate: "asc" }, select: { startDate: true, endDate: true } },
          reports: { where: { reportDate: reportDateUtc, status: ReportStatus.SUBMITTED },
            include: { photos: { orderBy: { sortOrder: "asc" } } } },
        },
      },
    },
  });
}
