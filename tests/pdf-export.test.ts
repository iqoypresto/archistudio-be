import { ReportStatus, WeatherType } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { prisma } from "../src/configs/prisma-client.config.js";
import { PdfExportService } from "../src/features/pdf-export/pdf-export.service.js";
import { buildTemplateADefinition } from "../src/features/pdf-export/pdf-export.template-a.js";

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
    vi.spyOn(prisma.project, "findFirst").mockResolvedValue({
      id: "proj-1",
      code: "VLA01",
      name: "Villa Canggu",
      location: "Bali",
      clientName: "Ibu Clara",
      areas: [
        {
          id: "area-1",
          code: "A",
          name: "Struktur",
          reports: [
            {
              id: "rep-1",
              reportNumber: "LH/VLA01/A/20261105",
              reportDate: new Date("2026-11-05T00:00:00.000Z"),
              reportType: "WORK",
              weather: WeatherType.CERAH,
              workerCount: 5,
              progressText: "Pengecoran balok selesai.",
              obstaclesText: null,
              tomorrowPlanText: null,
              noWorkReason: null,
              locationText: null,
              isLate: false,
              isRevised: false,
              submittedAt: new Date("2026-11-05T16:00:00.000Z"),
              signedByName: "Ahmad Fauzi",
              signedByTitle: "Supervisor",
              photos: [],
            },
          ],
        },
      ],
    } as any);

    const result = await PdfExportService.generateDailyReportPdf("proj-1", "2026-11-05");

    expect(result.filename).toBe("LH-VLA01-20261105.pdf");
    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.buffer.length).toBeGreaterThan(100);
  });
});
