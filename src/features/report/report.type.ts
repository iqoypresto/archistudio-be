import type { ReportStatus, ReportType, WeatherType } from "@prisma/client";
import type { z } from "zod";
import type { ReportValidation } from "./report.validation.js";

export type ListReportsQuery = z.infer<typeof ReportValidation.QUERY.list>;
export type SaveDraftBody = z.infer<typeof ReportValidation.BODY.saveDraft>;
export type UpdateDraftBody = z.infer<typeof ReportValidation.BODY.updateDraft>;
export type SubmitReportBody = z.infer<typeof ReportValidation.BODY.submit>;
export type ReviseReportBody = z.infer<typeof ReportValidation.BODY.revise>;

export interface ReportSnapshotJson {
  reportType: ReportType;
  progressText: string | null;
  obstaclesText: string | null;
  tomorrowPlanText: string | null;
  weather: WeatherType | null;
  workerCount: number | null;
  noWorkReason: string | null;
  locationText: string | null;
  submittedAt: string | null;
  isLate: boolean;
  signedByName: string | null;
  signedByTitle: string | null;
  photos: Array<{
    id: string;
    storageKey: string;
    caption: string | null;
    sortOrder: number;
    takenAt: string | null;
    uploadedAt: string | null;
  }>;
}

export interface ReportPhotoInput {
  storageKey: string;
  caption?: string | null;
  sortOrder: number;
  takenAt?: string | null;
  uploadedAt?: string | null;
}

export interface DailyReportPhotoDto {
  id: string;
  storageKey: string;
  signedViewUrl: string;
  caption: string | null;
  sortOrder: number;
  takenAt: string | null;
  uploadedAt: string | null;
}

export interface DailyReportRevisionDto {
  id: string;
  revisionNo: number;
  changeSummary: string;
  previousSnapshotJson: unknown;
  revisedByName: string;
  createdAt: string;
}

export interface DailyReportListItem {
  id: string;
  reportNumber: string;
  reportDate: string;
  reportType: ReportType;
  status: ReportStatus;
  isLate: boolean;
  lateLabel: string | null;
  isRevised: boolean;
  submittedAt: string | null;
  signedByName: string | null;
  signedByTitle: string | null;
  photoCount: number;
  area: { id: string; code: string; name: string };
  project: { id: string; code: string; name: string; timezone: string };
  supervisor: { id: string; name: string; jobTitle: string };
}

export interface DailyReportDetail extends DailyReportListItem {
  progressText: string | null;
  obstaclesText: string | null;
  tomorrowPlanText: string | null;
  weather: WeatherType | null;
  workerCount: number | null;
  noWorkReason: string | null;
  locationText: string | null;
  revisionNo: number;
  revisedAt: string | null;
  photos: DailyReportPhotoDto[];
  revisions: DailyReportRevisionDto[];
}
