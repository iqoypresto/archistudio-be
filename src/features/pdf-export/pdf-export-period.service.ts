import { addDaysToDateString, parseDateOnlyUtc } from "../../helpers/date.helper.js";
import { ReportArchiveService } from "../report/report-archive.service.js";
import { StorageAdapter } from "../../utils/storage/storage.adapter.js";
import { loadPdfMake } from "../../utils/pdf/pdfmake.loader.js";
import { findMissingReportAreas } from "./pdf-export.helper.js";
import { fetchProjectPeriod } from "./pdf-export.repository.js";
import { ResponseError } from "../../utils/errors/response-error.util.js";
import { calculateMonthlyAreaMetrics, type PeriodProject } from "./pdf-export-period.helper.js";
import { monthlyReportDefinition, rangeReportDefinition, type PeriodReportItem } from "./pdf-export-period.template.js";

type PeriodArea = PeriodProject["areas"][number];

function projectDates(project: PeriodProject) {
  return { projectStart: project.startDate, projectEnd: project.endDate, routineHolidays: project.routineHolidays };
}

function requiredAreas(project: PeriodProject, date: string) {
  return findMissingReportAreas({ areas: project.areas, reportDate: date, ...projectDates(project) });
}

function reportOn(area: PeriodArea, date: string) {
  return area.reports.find((report) => report.reportDate.toISOString().slice(0, 10) === date);
}

async function photoDataUrl(storageKey: string): Promise<string | null> {
  try {
    const bytes = await StorageAdapter.getObjectBuffer(storageKey);
    return `data:image/jpeg;base64,${bytes.toString("base64")}`;
  } catch { return null; }
}

async function rangeItem(area: PeriodArea, date: string): Promise<PeriodReportItem> {
  const report = reportOn(area, date);
  if (!report) return { date, areaCode: area.code, areaName: area.name };
  const photos = [];
  for (const photo of report.photos) photos.push({ dataUrl: await photoDataUrl(photo.storageKey), caption: photo.caption });
  return { date, areaCode: area.code, areaName: area.name, reportNumber: report.reportNumber,
    reportType: report.reportType, isLate: report.isLate, weather: report.weather,
    workerCount: report.workerCount, progressText: report.progressText, obstaclesText: report.obstaclesText,
    tomorrowPlanText: report.tomorrowPlanText, noWorkReason: report.noWorkReason,
    locationText: report.locationText, submittedAt: report.submittedAt?.toISOString() ?? null,
    signedByName: report.signedByName, signedByTitle: report.signedByTitle, photos };
}

export class PdfExportPeriodService {
  static async monthlySummary(projectId: string, month: string) {
    const { from, to } = monthBounds(month);
    await ReportArchiveService.process({ area: { projectId }, reportDate: { gte: parseDateOnlyUtc(from), lte: parseDateOnlyUtc(to) } });
    const project = await fetchProjectPeriod(projectId, parseDateOnlyUtc(from), parseDateOnlyUtc(to));
    if (!project) return null;
    return {
      project: { id: project.id, code: project.code, name: project.name },
      month,
      areas: calculateMonthlyAreaMetrics(project, month),
    };
  }

  static async monthly(projectId: string, month: string) {
    const { from, to } = monthBounds(month);
    await ReportArchiveService.process({ area: { projectId }, reportDate: { gte: parseDateOnlyUtc(from), lte: parseDateOnlyUtc(to) } });
    const project = await fetchProjectPeriod(projectId, parseDateOnlyUtc(from), parseDateOnlyUtc(to));
    if (!project) return null;
    const pdf = await loadPdfMake();
    const buffer = await pdf.createPdf(monthlyReportDefinition(project, month, calculateMonthlyAreaMetrics(project, month))).getBuffer();
    return { filename: `LH-${project.code}-${month.replace("-", "")}-REKAP.pdf`, buffer };
  }

  static async dailyRange(projectId: string, from: string, to: string) {
    const rangeDays = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;
    if (rangeDays > 7) throw new ResponseError("DATE_RANGE_TOO_LONG");
    await ReportArchiveService.process({ area: { projectId }, reportDate: { gte: parseDateOnlyUtc(from), lte: parseDateOnlyUtc(to) } });
    const project = await fetchProjectPeriod(projectId, parseDateOnlyUtc(from), parseDateOnlyUtc(to));
    if (!project) return null;
    const rows: PeriodReportItem[] = [];
    for (let date = from; date <= to; date = addDaysToDateString(date, 1)) {
      for (const area of requiredAreas(project, date)) {
        const fullArea = project.areas.find((item) => item.id === area.id);
        if (fullArea) rows.push(await rangeItem(fullArea, date));
      }
    }
    const pdf = await loadPdfMake();
    const buffer = await pdf.createPdf(rangeReportDefinition(project, from, to, rows)).getBuffer();
    return { filename: `LH-${project.code}-${from}-${to}.pdf`, buffer };
  }
}

function monthBounds(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return { from: `${month}-01`, to: new Date(Date.UTC(year ?? 0, monthNumber ?? 1, 0)).toISOString().slice(0, 10) };
}
