import { fetchProjectAndAreas } from "./pdf-export.repository.js";
import { ReportArchiveService } from "../report/report-archive.service.js";
import { parseDateOnlyUtc } from "../../helpers/date.helper.js";
import { ResponseError } from "../../utils/errors/response-error.util.js";
import { StorageAdapter } from "../../utils/storage/storage.adapter.js";
import { loadPdfMake } from "../../utils/pdf/pdfmake.loader.js";
import { buildTemplateADefinition } from "./pdf-export.template-a.js";
import { findMissingReportAreas } from "./pdf-export.helper.js";
import type { PdfAreaReportData, PdfDocumentData, PdfPhotoItem } from "./pdf-export.type.js";

type AreaWithReports = NonNullable<Awaited<ReturnType<typeof fetchProjectAndAreas>>>["areas"][number];


async function resolvePhotoDataUrl(storageKey: string): Promise<string | null> {
  try {
    const buffer = await StorageAdapter.getObjectBuffer(storageKey);
    return `data:image/jpeg;base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

async function mapAreaPhotos(photos: { storageKey: string; caption: string | null; sortOrder: number; takenAt: Date | null }[]): Promise<PdfPhotoItem[]> {
  const items: PdfPhotoItem[] = [];
  for (const p of photos) {
    const dataUrl = await resolvePhotoDataUrl(p.storageKey);
    items.push({
      storageKey: p.storageKey,
      caption: p.caption,
      sortOrder: p.sortOrder,
      takenAt: p.takenAt ? p.takenAt.toISOString() : null,
      dataUrl,
    });
  }
  return items;
}

async function mapAreaReport(area: AreaWithReports): Promise<PdfAreaReportData> {
  const report = area.reports[0];
  if (!report) {
    return { areaCode: area.code, areaName: area.name, hasReport: false, photos: [] };
  }
  const photos = await mapAreaPhotos(report.photos);
  return {
    areaCode: area.code,
    areaName: area.name,
    hasReport: true,
    reportNumber: report.reportNumber,
    reportType: report.reportType,
    weather: report.weather,
    workerCount: report.workerCount,
    progressText: report.progressText,
    obstaclesText: report.obstaclesText,
    tomorrowPlanText: report.tomorrowPlanText,
    noWorkReason: report.noWorkReason,
    locationText: report.locationText,
    isLate: report.isLate,
    isRevised: report.isRevised,
    submittedAt: report.submittedAt ? report.submittedAt.toISOString() : null,
    signedByName: report.signedByName,
    signedByTitle: report.signedByTitle,
    photos,
  };
}

export class PdfExportService {
  /** Menghasilkan PDF hanya setelah semua area wajib lapor lengkap (US-27, BR-29, BR-30). */
  static async generateDailyReportPdf(
    projectId: string,
    dateStr: string,
  ): Promise<{ filename: string; buffer: Buffer }> {
    const reportDateUtc = parseDateOnlyUtc(dateStr);
    await ReportArchiveService.process({ area: { projectId, deletedAt: null, project: { deletedAt: null } }, reportDate: reportDateUtc });
    const project = await fetchProjectAndAreas(projectId, reportDateUtc);
    if (!project) throw new ResponseError("RESOURCE_NOT_FOUND");
    const requiredAreas = findMissingReportAreas({
      areas: project.areas,
      reportDate: dateStr,
      projectStart: project.startDate,
      projectEnd: project.endDate,
      routineHolidays: project.routineHolidays,
    });
    if (requiredAreas.length === 0) {
      throw new ResponseError(
        "VALIDATION_ERROR",
        "Tidak ada area wajib lapor pada tanggal yang dipilih (hari libur rutin atau di luar jadwal proyek).",
      );
    }
    const submittedAreaIds = new Set(project.areas.filter((area) => area.reports.length > 0).map((area) => area.id));
    const incomplete = requiredAreas.filter((area) => !submittedAreaIds.has(area.id));
    if (incomplete.length > 0) {
      throw new ResponseError("DAILY_REPORTS_INCOMPLETE", undefined, {
        missingAreas: incomplete.map((area) => `${area.code} — ${area.name}`),
      });
    }

    const areasData: PdfAreaReportData[] = [];
    for (const a of project.areas.filter((area) => requiredAreas.some((required) => required.id === area.id))) {
      areasData.push(await mapAreaReport(a));
    }

    const docData: PdfDocumentData = {
      projectCode: project.code,
      projectName: project.name,
      location: project.location,
      clientName: project.clientName,
      reportDate: dateStr,
      generatedAt: new Date().toISOString().slice(0, 16).replace("T", " "),
      areas: areasData,
    };

    const docDef = buildTemplateADefinition(docData);
    const pdfmake = await loadPdfMake();
    const pdfDoc = pdfmake.createPdf(docDef);
    const buffer = await pdfDoc.getBuffer();
    const cleanDate = dateStr.replace(/-/g, "");

    return {
      filename: `LH-${project.code}-${cleanDate}.pdf`,
      buffer,
    };
  }
}
