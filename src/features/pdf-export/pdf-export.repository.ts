import { ReportStatus } from "@prisma/client";
import { prisma } from "../../configs/prisma-client.config.js";

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
