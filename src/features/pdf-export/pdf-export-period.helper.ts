import { addDaysToDateString } from "../../helpers/date.helper.js";
import { findMissingReportAreas } from "./pdf-export.helper.js";
import type { fetchProjectPeriod } from "./pdf-export.repository.js";
import type { MonthlyAreaMetrics } from "./pdf-export-period.template.js";

export type PeriodProject = NonNullable<Awaited<ReturnType<typeof fetchProjectPeriod>>>;

function isLateReport(project: PeriodProject, areaId: string, date: string): boolean | undefined {
  const area = project.areas.find((item) => item.id === areaId);
  return area?.reports.find((report) => report.reportDate.toISOString().slice(0, 10) === date)?.isLate;
}

export function calculateMonthlyAreaMetrics(project: PeriodProject, month: string): MonthlyAreaMetrics[] {
  const [year, monthNumber] = month.split("-").map(Number);
  const from = `${month}-01`;
  const to = new Date(Date.UTC(year ?? 0, monthNumber ?? 1, 0)).toISOString().slice(0, 10);
  const totals = new Map(project.areas.map((area) => [area.id, {
    areaCode: area.code, areaName: area.name, requiredDays: 0, onTime: 0, late: 0, missing: 0,
  }]));
  for (let date = from; date <= to; date = addDaysToDateString(date, 1)) {
    const required = findMissingReportAreas({ areas: project.areas, reportDate: date,
      projectStart: project.startDate, projectEnd: project.endDate, routineHolidays: project.routineHolidays });
    for (const area of required) {
      const total = totals.get(area.id);
      if (!total) continue;
      total.requiredDays += 1;
      const isLate = isLateReport(project, area.id, date);
      if (isLate === undefined) total.missing += 1;
      else if (isLate) total.late += 1;
      else total.onTime += 1;
    }
  }
  return [...totals.values()];
}
