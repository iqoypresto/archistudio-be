import { ReportStatus } from "@prisma/client";
import { prisma } from "../../configs/prisma-client.config.js";

export async function fetchProjectAndAreas(projectId: string, reportDateUtc: Date) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    include: {
      areas: {
        where: { deletedAt: null },
        orderBy: { code: "asc" },
        include: {
          reports: {
            where: { reportDate: reportDateUtc, status: ReportStatus.SUBMITTED },
            include: { photos: { orderBy: { sortOrder: "asc" } } },
          },
        },
      },
    },
  });
  return project;
}
