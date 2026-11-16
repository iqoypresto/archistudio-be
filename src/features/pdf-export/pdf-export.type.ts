export interface PdfPhotoItem {
  storageKey: string;
  caption: string | null;
  sortOrder: number;
  takenAt: string | null;
  dataUrl?: string | null;
}

export interface PdfAreaReportData {
  areaCode: string;
  areaName: string;
  hasReport: boolean;
  reportNumber?: string | null;
  reportType?: "WORK" | "NO_WORK";
  weather?: string | null;
  workerCount?: number | null;
  progressText?: string | null;
  obstaclesText?: string | null;
  tomorrowPlanText?: string | null;
  noWorkReason?: string | null;
  locationText?: string | null;
  isLate?: boolean;
  isRevised?: boolean;
  submittedAt?: string | null;
  signedByName?: string | null;
  signedByTitle?: string | null;
  photos: PdfPhotoItem[];
}

export interface PdfDocumentData {
  projectCode: string;
  projectName: string;
  location: string;
  clientName: string;
  reportDate: string;
  generatedAt: string;
  areas: PdfAreaReportData[];
}
