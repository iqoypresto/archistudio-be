import { isRestDay } from "../../helpers/date.helper.js";

type RequiredArea = {
  id: string;
  code: string;
  name: string;
  assignments: { startDate: Date; endDate: Date | null }[];
};

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function findMissingReportAreas(params: {
  areas: RequiredArea[];
  reportDate: string;
  projectStart: Date;
  projectEnd: Date | null;
  routineHolidays: number[];
}) {
  if (isRestDay(params.reportDate, params.routineHolidays)) return [];
  if (params.reportDate < toDateString(params.projectStart) ||
      (params.projectEnd && params.reportDate > toDateString(params.projectEnd))) return [];
  return params.areas.filter((area) => {
    const assignment = area.assignments.find((item) => {
      const start = toDateString(item.startDate);
      const end = item.endDate ? toDateString(item.endDate) : null;
      return params.reportDate >= start && (!end || params.reportDate <= end);
    });
    return Boolean(assignment);
  });
}
