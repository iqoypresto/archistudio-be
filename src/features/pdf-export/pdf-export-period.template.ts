import type { Content, TDocumentDefinitions } from "pdfmake/interfaces.js";

export interface MonthlyAreaMetrics {
  areaCode: string;
  areaName: string;
  requiredDays: number;
  onTime: number;
  late: number;
  missing: number;
}

export interface PeriodReportItem {
  date: string;
  areaCode: string;
  areaName: string;
  reportNumber?: string;
  isLate?: boolean;
  reportType?: string;
  weather?: string | null;
  workerCount?: number | null;
  progressText?: string | null;
  obstaclesText?: string | null;
  tomorrowPlanText?: string | null;
  noWorkReason?: string | null;
  locationText?: string | null;
  submittedAt?: string | null;
  signedByName?: string | null;
  photos?: { dataUrl: string | null; caption: string | null }[];
  signedByTitle?: string | null;
}

function header(project: { code: string; name: string }, title: string, subtitle: string): Content[] {
  return [
    { text: "ARCHISTUDIO", fontSize: 16, bold: true, color: "#1E40AF" },
    { text: title, fontSize: 12, bold: true, margin: [0, 4, 0, 2] },
    { text: `[${project.code}] ${project.name} · ${subtitle}`, fontSize: 9, color: "#475569", margin: [0, 0, 0, 12] },
  ];
}

export function monthlyReportDefinition(project: { code: string; name: string }, month: string, areas: MonthlyAreaMetrics[]): TDocumentDefinitions {
  const table: Content = { table: {
    headerRows: 1,
    widths: ["auto", "*", "auto", "auto", "auto", "auto"],
    body: [["Kode Area", "Nama Area", "Hari Wajib Lapor", "Tepat Waktu", "Terlambat", "Belum Lapor"],
      ...areas.map((area) => [area.areaCode, area.areaName, area.requiredDays, area.onTime, area.late, area.missing])],
  }, layout: "lightHorizontalLines" };
  return { pageSize: "A4", pageOrientation: "landscape", pageMargins: [28, 32, 28, 32],
    content: [...header(project, "REKAP LAPORAN BULANAN", month), table],
    defaultStyle: { font: "Roboto", fontSize: 9 } };
}

export function rangeReportDefinition(
  project: { code: string; name: string }, fromDate: string, toDate: string, reports: PeriodReportItem[],
): TDocumentDefinitions {
  const content: Content[] = header(project, "LAPORAN HARIAN RENTANG TANGGAL", `${fromDate} — ${toDate}`);
  for (const item of reports) content.push(...rangeItemContent(item));
  return { pageSize: "A4", pageOrientation: "portrait", pageMargins: [32, 32, 32, 32],
    content, defaultStyle: { font: "Roboto", fontSize: 9 } };
}

function rangeItemContent(item: PeriodReportItem): Content[] {
  const title = { text: `${item.date} · Area ${item.areaCode}: ${item.areaName}`, bold: true, color: "#1E40AF", margin: [0, 10, 0, 4] } as Content;
  if (!item.reportNumber) return [title, { text: "Belum lapor", italics: true, color: "#64748B" }];
  const details: Content[] = [title, { text: `${item.reportNumber} · ${item.reportType} · ${item.isLate ? "Terlambat" : "Tepat waktu"}`, bold: true }];
  const fields = [
    ["Cuaca", item.weather], ["Jumlah pekerja", item.workerCount], ["Progres", item.progressText],
    ["Kendala", item.obstaclesText], ["Rencana besok", item.tomorrowPlanText],
    ["Alasan tanpa pekerjaan", item.noWorkReason], ["Lokasi", item.locationText],
    ["Dikirim oleh", item.signedByName], ["Jabatan", item.signedByTitle], ["Waktu kirim", item.submittedAt],
  ] as const;
  for (const [label, value] of fields) {
    if (value !== null && value !== undefined && value !== "") details.push({ text: `${label}: ${value}`, margin: [0, 3, 0, 0] });
  }
  for (const photo of item.photos ?? []) {
    details.push(photo.dataUrl ? { image: photo.dataUrl, width: 260, margin: [0, 6, 0, 0] } : { text: "Foto tidak tersedia", italics: true });
    if (photo.caption) details.push({ text: photo.caption, fontSize: 8, color: "#475569" });
  }
  return details;
}
