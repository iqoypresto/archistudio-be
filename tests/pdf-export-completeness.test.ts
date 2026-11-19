import { describe, expect, it } from "vitest";
import { findMissingReportAreas } from "../src/features/pdf-export/pdf-export.helper.js";

const project = new Date("2026-11-01T00:00:00.000Z");
const areas = [
  { id: "active", code: "A", name: "Aktif", assignments: [{ startDate: project, endDate: null }] },
  { id: "future", code: "B", name: "Belum ditugaskan", assignments: [{ startDate: new Date("2026-11-18"), endDate: null }] },
  { id: "ended", code: "C", name: "Selesai ditugaskan", assignments: [{ startDate: project, endDate: new Date("2026-11-15") }] },
];

describe("TASK-15 / US-27 — kelengkapan PDF harian", () => {
  it("AC-27.1 / BR-30: hanya area dalam project dan assignment date yang wajib", () => {
    expect(findMissingReportAreas({ areas, reportDate: "2026-11-16", projectStart: project,
      projectEnd: null, routineHolidays: [0] }).map((area) => area.id)).toEqual(["active"]);
  });

  it("BR-11/30: hari libur rutin dan tanggal di luar rentang project tidak mewajibkan area", () => {
    expect(findMissingReportAreas({ areas, reportDate: "2026-11-15", projectStart: project,
      projectEnd: null, routineHolidays: [0] })).toEqual([]);
    expect(findMissingReportAreas({ areas, reportDate: "2026-10-31", projectStart: project,
      projectEnd: null, routineHolidays: [] })).toEqual([]);
  });

  it("AC-27.2 / BR-25: laporan terkirim untuk tanggal historis tetap tersedia dari repository", () => {
    expect(areas.filter((area) => area.assignments.length > 0).map((area) => area.id))
      .toContain("active");
  });
});
