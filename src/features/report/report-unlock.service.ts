import { toBusinessDateString } from "../../helpers/date.helper.js";
import { ResponseError } from "../../utils/errors/response-error.util.js";
import { evaluateAreaLock } from "./report-lock.helper.js";
import { ReportUnlockRepository } from "./report-unlock.repository.js";
import type { UnlockAreaBody } from "./report-unlock.validation.js";

export class ReportUnlockService {
  /** Memvalidasi ambang tunggakan di server sebelum menyimpan unlock manual (BR-22). */
  static async unlockArea(
    areaId: string,
    unlockedById: string,
    body: UnlockAreaBody,
    now = new Date(),
  ) {
    const area = await ReportUnlockRepository.findAreaLockData(areaId);
    if (!area) {
      throw new ResponseError("RESOURCE_NOT_FOUND");
    }
    const assignment = area.assignments[0];
    const { lockState } = evaluateAreaLock({
      projectStartDate: area.project.startDate,
      projectEndDate: area.project.endDate,
      assignmentStartDate: assignment?.startDate ?? area.project.startDate,
      assignmentEndDate: assignment?.endDate ?? null,
      todayDate: toBusinessDateString(now, area.project.timezone),
      routineHolidays: area.project.routineHolidays,
      reports: area.reports,
      unlockedThroughDate: area.unlocks[0]?.unlockedThroughDate ?? null,
    });
    if (!lockState.isOverdueMoreThan3Days) {
      throw new ResponseError("UNLOCK_THRESHOLD_NOT_REACHED");
    }
    const unlock = await ReportUnlockRepository.createUnlock(areaId, unlockedById, body);
    return {
      ...unlock,
      unlockedThroughDate: unlock.unlockedThroughDate.toISOString().slice(0, 10),
    };
  }
}
