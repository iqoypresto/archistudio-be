import type { ProjectStatus, ReportStatus, ReportType, Role, WeatherType } from "@prisma/client";
import type { z } from "zod";
import type { ReportValidation } from "./report.validation.js";

export type ListReportsQuery = z.infer<typeof ReportValidation.QUERY.list>;
export type ListArchivedReportsQuery = z.infer<typeof ReportValidation.QUERY.archive>;
export type SubmitNewBody = z.infer<typeof ReportValidation.BODY.submitNew>;
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
    storedFileId: string;
    caption: string | null;
    sortOrder: number;
    takenAt: string | null;
    uploadedAt: string | null;
  }>;
}

export interface ReportPhotoInput {
  storedFileId: string;
  caption?: string | null;
  sortOrder: number;
  takenAt?: string | null;
}

export interface DailyReportPhotoDto {
  id: string;
  storedFileId: string;
  contentPath: string;
  fileName: string;
  contentType: string;
  fileSizeBytes: number;
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
  archivedAt: string | null;
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
  project: {
    id: string;
    code: string;
    name: string;
    timezone: string;
    status?: ProjectStatus;
    archivedAt?: string | null;
  };
  supervisor: { id: string; name: string; jobTitle: string; role?: Role };
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
