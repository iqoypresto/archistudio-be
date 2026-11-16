import type { Content, TDocumentDefinitions } from "pdfmake/interfaces.js";
import type { PdfAreaReportData, PdfDocumentData } from "./pdf-export.type.js";

function buildAreaHeader(area: PdfAreaReportData): Content {
  return {
    table: {
      widths: ["*"],
      body: [
        [
          {
            text: `AREA ${area.areaCode}: ${area.areaName.toUpperCase()}`,
            style: "areaHeader",
            fillColor: "#DBEAFE",
          },
        ],
      ],
    },
    margin: [0, 10, 0, 6] as [number, number, number, number],
  };
}

function buildWorkDetails(area: PdfAreaReportData): Content[] {
  return [
    {
      text: [
        { text: "Cuaca: ", bold: true },
        `${area.weather ?? "-"}   |   `,
        { text: "Pekerja Hadir: ", bold: true },
        `${area.workerCount ?? 0} orang   |   `,
        { text: "Status: ", bold: true },
        area.isLate ? "Terlambat (> 17:00)" : "Tepat Waktu",
      ],
      margin: [0, 0, 0, 4] as [number, number, number, number],
    },
    { text: "Progres Pekerjaan:", bold: true, margin: [0, 4, 0, 2] as [number, number, number, number] },
    { text: area.progressText ?? "-", style: "bodyText" },
    { text: "Hambatan / Kendala:", bold: true, margin: [0, 4, 0, 2] as [number, number, number, number] },
    { text: area.obstaclesText || "Tidak ada kendala", style: "bodyText" },
    { text: "Rencana Besok:", bold: true, margin: [0, 4, 0, 2] as [number, number, number, number] },
    { text: area.tomorrowPlanText ?? "-", style: "bodyText" },
  ];
}

function buildPhotoCells(photos: PdfAreaReportData["photos"]) {
  const rows: unknown[][] = [];
  for (let i = 0; i < photos.length; i += 2) {
    const p1 = photos[i];
    const p2 = photos[i + 1];
    const c1 = p1?.dataUrl
      ? [{ image: p1.dataUrl, width: 235 }, { text: p1.caption ?? "Foto dokumentasi", style: "photoCaption" }]
      : [{ text: "[Foto Dokumentasi]", style: "photoPlaceholder" }, { text: p1?.caption ?? "-", style: "photoCaption" }];
    const c2 = p2
      ? p2.dataUrl
        ? [{ image: p2.dataUrl, width: 235 }, { text: p2.caption ?? "Foto dokumentasi", style: "photoCaption" }]
        : [{ text: "[Foto Dokumentasi]", style: "photoPlaceholder" }, { text: p2.caption ?? "-", style: "photoCaption" }]
      : [];
    rows.push([{ stack: c1 }, { stack: c2 }]);
  }
  return rows;
}

function buildPhotoGrid(photos: PdfAreaReportData["photos"]): Content[] {
  if (photos.length === 0) return [];
  const rows = buildPhotoCells(photos);
  return [
    { text: "Dokumentasi Foto Lapangan:", bold: true, margin: [0, 8, 0, 4] as [number, number, number, number] },
    { table: { widths: ["50%", "50%"], body: rows as any }, layout: "noBorders", margin: [0, 0, 0, 6] as [number, number, number, number] },
  ];
}

function buildSignature(area: PdfAreaReportData): Content[] {
  if (!area.hasReport) return [];
  return [
    {
      columns: [
        { width: "*", text: "" },
        {
          width: 180,
          stack: [
            { text: "Dibuat oleh Supervisor:", alignment: "center", fontSize: 9 },
            { text: "\n\n( Paraf Otomatis Sistem )", alignment: "center", fontSize: 8, italics: true },
            { text: `\n${area.signedByName ?? "Supervisor Lapangan"}`, alignment: "center", bold: true },
            { text: `${area.signedByTitle ?? "Supervisor Lapangan"}`, alignment: "center", fontSize: 8 },
            { text: `Waktu Kirim: ${area.submittedAt?.slice(0, 16).replace("T", " ") ?? "-"}`, alignment: "center", fontSize: 7, color: "#64748B" },
          ],
        },
      ],
      margin: [0, 6, 0, 12] as [number, number, number, number],
    },
  ];
}

function buildAreaSection(area: PdfAreaReportData): Content[] {
  if (!area.hasReport) {
    return [
      buildAreaHeader(area),
      { text: "Belum ada laporan harian pada tanggal ini.", italics: true, color: "#94A3B8", margin: [0, 4, 0, 10] as [number, number, number, number] },
    ];
  }
  const content = area.reportType === "WORK"
    ? buildWorkDetails(area)
    : [
        { text: "Jenis: Hari Tanpa Pekerjaan", bold: true, color: "#D97706" },
        { text: `Alasan: ${area.noWorkReason ?? "-"}`, margin: [0, 4, 0, 4] as [number, number, number, number] },
      ];
  return [buildAreaHeader(area), ...content, ...buildPhotoGrid(area.photos), ...buildSignature(area)];
}

export function buildTemplateADefinition(data: PdfDocumentData): TDocumentDefinitions {
  const content: Content[] = [
    {
      table: {
        widths: ["*"],
        body: [
          [
            {
              stack: [
                { text: "ARCHISTUDIO", fontSize: 16, bold: true, color: "#FFFFFF" },
                { text: "LAPORAN HARIAN PROYEK KONSTRUKSI (OPSI A)", fontSize: 11, color: "#E0E7FF", margin: [0, 2, 0, 0] as [number, number, number, number] },
              ],
              fillColor: "#1E40AF",
              margin: [8, 8, 8, 8] as [number, number, number, number],
            },
          ],
        ],
      },
      margin: [0, 0, 0, 10] as [number, number, number, number],
    },
    {
      columns: [
        {
          width: "55%",
          stack: [
            { text: [{ text: "Proyek: ", bold: true }, `[${data.projectCode}] ${data.projectName}`] },
            { text: [{ text: "Lokasi: ", bold: true }, data.location] },
            { text: [{ text: "Klien: ", bold: true }, data.clientName] },
          ],
        },
        {
          width: "45%",
          stack: [
            { text: [{ text: "Tanggal Laporan: ", bold: true }, data.reportDate], alignment: "right" },
            { text: [{ text: "Waktu Export: ", bold: true }, data.generatedAt], alignment: "right", fontSize: 8, color: "#64748B" },
          ],
        },
      ],
      margin: [0, 0, 0, 8] as [number, number, number, number],
    },
    { canvas: [{ type: "line", x1: 0, y1: 0, x2: 525, y2: 0, lineWidth: 1, lineColor: "#CBD5E1" }], margin: [0, 0, 0, 6] as [number, number, number, number] },
    ...data.areas.flatMap((a) => buildAreaSection(a)),
  ];

  return {
    pageSize: "A4",
    pageOrientation: "portrait",
    pageMargins: [35, 35, 35, 35],
    footer: (currentPage, pageCount) => ({
      text: `Halaman ${currentPage} dari ${pageCount} — ArchiStudio Internal Office`,
      alignment: "center",
      fontSize: 8,
      color: "#94A3B8",
      margin: [0, 10, 0, 0] as [number, number, number, number],
    }),
    content,
    styles: {
      areaHeader: { fontSize: 10, bold: true, color: "#1E40AF", margin: [6, 4, 6, 4] as [number, number, number, number] },
      bodyText: { fontSize: 9, lineHeight: 1.2, margin: [0, 0, 0, 4] as [number, number, number, number] },
      photoCaption: { fontSize: 8, color: "#475569", margin: [0, 2, 0, 4] as [number, number, number, number] },
      photoPlaceholder: { fontSize: 8, color: "#94A3B8", italics: true, margin: [0, 10, 0, 10] as [number, number, number, number] },
    },
    defaultStyle: { font: "Roboto", fontSize: 9, color: "#0F172A" },
  };
}
