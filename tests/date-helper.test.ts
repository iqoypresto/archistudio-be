import { describe, expect, it } from "vitest";
import {
  addDaysToDateString,
  computeAreaLockState,
  isPastCutoff,
  isRestDay,
  toBusinessDateString,
} from "../src/helpers/date.helper.js";

describe("date.helper — Zona Waktu, Libur Rutin, Cutoff 17:00 & Kunci Bertahap", () => {
  it("mengonversi UTC ke tanggal bisnis sesuai timezone IANA project (ADR-04)", () => {
    const utcMoment = new Date("2026-11-12T16:30:00.000Z");
    expect(toBusinessDateString(utcMoment, "Asia/Jakarta")).toBe("2026-11-12");
    expect(toBusinessDateString(utcMoment, "Asia/Makassar")).toBe("2026-11-13");
    expect(addDaysToDateString("2026-11-12", 1)).toBe("2026-11-13");
  });

  it("mengenali hari libur rutin project dengan benar (BR-11)", () => {
    expect(isRestDay("2026-11-08", [0])).toBe(true); // Minggu
    expect(isRestDay("2026-11-09", [0])).toBe(false); // Senin
  });

  it("menandai batas kirim tepat 17:00:00 tepat waktu dan 17:00:01 terlambat (BR-18)", () => {
    const exactCutoffMakassar = new Date("2026-11-12T09:00:00.000Z"); // 17:00:00 WITA
    const oneSecondLate = new Date("2026-11-12T09:00:01.000Z"); // 17:00:01 WITA
    const nextDayMorning = new Date("2026-11-13T01:00:00.000Z");

    expect(isPastCutoff(exactCutoffMakassar, "2026-11-12", "Asia/Makassar")).toBe(false);
    expect(isPastCutoff(oneSecondLate, "2026-11-12", "Asia/Makassar")).toBe(true);
    expect(isPastCutoff(nextDayMorning, "2026-11-12", "Asia/Makassar")).toBe(true);
  });

  it("mengunci laporan hari ini jika ada hari kerja sebelumnya belum lapor (BR-20)", () => {
    const state = computeAreaLockState({
      projectStartDate: "2026-11-09",
      assignmentStartDate: "2026-11-09",
      todayDate: "2026-11-12",
      routineHolidays: [0],
      submittedDates: ["2026-11-09"],
    });

    expect(state.isTodayLocked).toBe(true);
    expect(state.pendingDates).toEqual(["2026-11-10", "2026-11-11", "2026-11-12"]);
    expect(state.nextRequiredDate).toBe("2026-11-10");
    expect(state.overdueBusinessDaysCount).toBe(2);
    expect(state.isOverdueMoreThan3Days).toBe(false);
  });

  it("mengecualikan hari libur rutin Minggu saat mengevaluasi kunci Senin (BR-11, BR-20)", () => {
    const state = computeAreaLockState({
      projectStartDate: "2026-11-07",
      assignmentStartDate: "2026-11-07",
      todayDate: "2026-11-09", // Senin (2026-11-08 adalah Minggu)
      routineHolidays: [0],
      submittedDates: ["2026-11-07"],
    });

    expect(state.isTodayLocked).toBe(false);
    expect(state.nextRequiredDate).toBe("2026-11-09");
    expect(state.overdueBusinessDaysCount).toBe(0);
  });

  it("mendeteksi tunggakan > 3 hari kerja dan membuka kunci via unlockedThroughDate (BR-22)", () => {
    const locked = computeAreaLockState({
      projectStartDate: "2026-11-02",
      assignmentStartDate: "2026-11-02",
      todayDate: "2026-11-07",
      routineHolidays: [0],
      submittedDates: ["2026-11-02"],
    });
    expect(locked.overdueBusinessDaysCount).toBe(4);
    expect(locked.isOverdueMoreThan3Days).toBe(true);

    const unlocked = computeAreaLockState({
      projectStartDate: "2026-11-02",
      assignmentStartDate: "2026-11-02",
      todayDate: "2026-11-07",
      routineHolidays: [0],
      submittedDates: ["2026-11-02"],
      unlockedThroughDate: "2026-11-06",
    });
    expect(unlocked.isTodayLocked).toBe(false);
    expect(unlocked.nextRequiredDate).toBe("2026-11-07");
    expect(unlocked.overdueBusinessDaysCount).toBe(0);
  });
});
