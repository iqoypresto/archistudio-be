import { randomUUID } from "node:crypto";

function safeCode(value: string): string {
  return value.normalize("NFKD").replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-").slice(0, 24).toUpperCase();
}

function extensionFor(contentType: string): string {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}

export function buildReportPhotoFileName(input: {
  projectCode: string;
  areaCode: string;
  reportDate: string;
  photoOrder: number;
  contentType: string;
}): string {
  const uniqueSuffix = randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase();
  const date = input.reportDate.replaceAll("-", "");
  const order = String(input.photoOrder).padStart(2, "0");
  return `RPT-${safeCode(input.projectCode)}-${safeCode(input.areaCode)}-${date}-P${order}-${uniqueSuffix}.${extensionFor(input.contentType)}`;
}
