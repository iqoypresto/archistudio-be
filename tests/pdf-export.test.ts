import { Prisma, ProjectStatus, ReportStatus, ReportType, WeatherType } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { prisma } from "../src/configs/prisma-client.config.js";
import { PdfExportService } from "../src/features/pdf-export/pdf-export.service.js";
import { buildTemplateADefinition } from "../src/features/pdf-export/pdf-export.template-a.js";

type ProjectWithReportPhotos = Prisma.ProjectGetPayload<{
  include: {
    areas: {
      include: {
        reports: {
          include: { photos: true };
        };
      };
    };
  };
}>;

describe("TASK-08 Backend Export PDF Laporan Harian Opsi A (US-15, BR-27..BR-31)", () => {
  it("[BR-31] membangun definisi dokumen pdfmake Template Opsi A dengan kepala biru", () => {
    const docDef = buildTemplateADefinition({
      projectCode: "VLA01",
      projectName: "Villa Canggu",
      location: "Badung, Bali",
      clientName: "Ibu Clara",
      reportDate: "2026-11-05",
      generatedAt: "2026-11-05 18:00",
      areas: [
        {
          areaCode: "A",
          areaName: "Struktur Utama",
          hasReport: true,
          reportNumber: "LH/VLA01/A/20261105",
          reportType: "WORK",
          weather: WeatherType.CERAH,
          workerCount: 8,
          progressText: "Pengecoran balok lantai 2 selesai 100%.",
          obstaclesText: "Tidak ada",
          tomorrowPlanText: "Pemasangan bekisting kolom lantai 3.",
          isLate: false,
          submittedAt: "2026-11-05T16:30:00.000Z",
          signedByName: "Ahmad Fauzi",
          signedByTitle: "Supervisor Lapangan",
          photos: [],
        },
        {
          areaCode: "B",
          areaName: "Finishing",
          hasReport: false,
          photos: [],
        },
      ],
    });

    expect(docDef.pageSize).toBe("A4");
    expect(docDef.pageOrientation).toBe("portrait");
    expect(Array.isArray(docDef.content)).toBe(true);
  });

  it("[US-15 / BR-30] menghasilkan buffer biner PDF dengan format nama file LH-KODE-YYYYMMDD", async () => {
    const createdAt = new Date("2026-11-01T00:00:00.000Z");
    const updatedAt = new Date("2026-11-05T00:00:00.000Z");
    const project: ProjectWithReportPhotos = {
      id: "proj-1",
      code: "VLA01",
      name: "Villa Canggu",
      location: "Bali",
      clientName: "Ibu Clara",
      startDate: new Date("2026-11-01T00:00:00.000Z"),
      endDate: null,
      status: ProjectStatus.BERJALAN,
      timezone: "Asia/Jakarta",
      routineHolidays: [0],
      completedAt: null,
      archivedAt: null,
      deletedAt: null,
      createdAt,
      updatedAt,
      areas: [
        {
          id: "area-1",
          projectId: "proj-1",
          code: "A",
          name: "Struktur",
          deletedAt: null,
          createdAt,
          updatedAt,
          reports: [
            {
              id: "rep-1",
              reportNumber: "LH/VLA01/A/20261105",
              areaId: "area-1",
              supervisorId: "supervisor-1",
              reportDate: new Date("2026-11-05T00:00:00.000Z"),
              reportType: ReportType.WORK,
              status: ReportStatus.SUBMITTED,
              weather: WeatherType.CERAH,
              workerCount: 5,
              progressText: "Pengecoran balok selesai.",
              obstaclesText: null,
              tomorrowPlanText: null,
              noWorkReason: null,
              locationText: null,
              isLate: false,
              isRevised: false,
              revisionNo: 0,
              revisedAt: null,
              revisedById: null,
              archivedAt: null,
              submittedAt: new Date("2026-11-05T16:00:00.000Z"),
              signedByName: "Ahmad Fauzi",
              signedByTitle: "Supervisor",
              createdAt,
              updatedAt,
              photos: [],
            },
          ],
        },
      ],
    };
    vi.spyOn(prisma.project, "findFirst").mockResolvedValue(project);

    const result = await PdfExportService.generateDailyReportPdf("proj-1", "2026-11-05");

    expect(result.filename).toBe("LH-VLA01-20261105.pdf");
    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.buffer.length).toBeGreaterThan(100);
  });
});
