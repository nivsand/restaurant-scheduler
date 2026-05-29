// Scoring function. Pure: takes the candidate + slot + state + history and
// returns score + breakdown. Higher = better.

import { SHIFT_DEFS } from "@/lib/shifts";
import {
  AssignmentState,
  AvailabilityRow,
  EmployeeProfile,
  HistorySnapshot,
  ScoreComponent,
  SlotDef,
} from "./types";

const WEIGHTS = {
  base: 100,
  // Fairness uses asymmetric penalty: stronger penalty for being OVER target
  // than reward for being UNDER. This actively pushes under-worked employees
  // up the candidate list, instead of just penalizing any deviation.
  fairnessOverTargetPerShift: -10,
  fairnessUnderTargetPerShift: 5,
  historyClosingsPerUnit: -10,   // delta over team avg → −, under team avg → +
  historyWeekendsPerUnit: -10,
  historyTotalPerUnit: -3,
  availabilityConfidenceMax: 15, // multiplied by confidence (0..1)
  preferenceViolation: -40,      // per soft violation
  preferenceAligned: 8,          // matches preference (small reward)
  approachingMinShifts: 25,      // assignment moves emp toward minShifts
  approachingRequested: 20,      // assignment moves emp toward requestedShifts
  filledRequested: 35,           // this assignment exactly hits requestedShifts
} as const;

export function scoreCandidate(
  emp: EmployeeProfile,
  slot: SlotDef,
  availability: AvailabilityRow,
  state: AssignmentState,
  history: HistorySnapshot,
  activeEmployeeCount: number,
  totalRemainingSlots: number,
): { score: number; breakdown: ScoreComponent[] } {
  const breakdown: ScoreComponent[] = [];
  let score = WEIGHTS.base;
  breakdown.push({ key: "base", delta: WEIGHTS.base });

  // ── Within-week fairness (asymmetric: punish overload, reward underload) ─
  const currentShifts = state.byEmployee.get(emp.id)?.length ?? 0;
  const target = computeTargetShifts(emp, activeEmployeeCount, totalRemainingSlots, state);
  const overTarget = currentShifts - target; // positive = above target
  let fairDelta = 0;
  if (overTarget >= 0) {
    // assigning would put emp at currentShifts+1; if already at-or-over, penalize
    fairDelta = Math.round(WEIGHTS.fairnessOverTargetPerShift * (overTarget + 1));
  } else {
    // currently under target — reward the assignment
    fairDelta = Math.round(WEIGHTS.fairnessUnderTargetPerShift * -overTarget);
  }
  if (fairDelta !== 0) {
    breakdown.push({
      key: "fairnessWithinWeek",
      delta: fairDelta,
      note: `${currentShifts}/${target.toFixed(1)} מתוך הצפי`,
    });
    score += fairDelta;
  }

  // ── History fairness (only meaningful when window has data) ─────────────
  const empHist = history.perEmployee.get(emp.id);
  if (empHist && history.weeksInWindow > 0) {
    // Closing balance — only matters for closing slots
    if (slot.isClosing) {
      const delta = empHist.closingShifts - history.groupMean.closingShifts;
      const c = Math.round(WEIGHTS.historyClosingsPerUnit * delta);
      if (Math.abs(c) >= 2) {
        breakdown.push({
          key: "historyClosings",
          delta: c,
          note:
            delta < 0
              ? `${(-delta).toFixed(1)} פחות סגירות מהממוצע`
              : `${delta.toFixed(1)} יותר סגירות מהממוצע`,
        });
        score += c;
      }
    }
    // Weekend balance — only matters for Friday slots
    if (slot.isFriday) {
      const delta = empHist.weekendShifts - history.groupMean.weekendShifts;
      const c = Math.round(WEIGHTS.historyWeekendsPerUnit * delta);
      if (Math.abs(c) >= 2) {
        breakdown.push({ key: "historyWeekends", delta: c });
        score += c;
      }
    }
    // Total volume balance — small steady pressure
    if (history.groupMean.totalShifts > 0) {
      const delta = empHist.totalShifts - history.groupMean.totalShifts;
      const c = Math.round(WEIGHTS.historyTotalPerUnit * delta);
      if (Math.abs(c) >= 2) {
        breakdown.push({
          key: "historyTotal",
          delta: c,
          note: `${empHist.totalShifts} משמרות ב-${history.windowDays} ימים אחרונים`,
        });
        score += c;
      }
    }
  }

  // ── Availability confidence boost ───────────────────────────────────────
  const confBoost = Math.round(WEIGHTS.availabilityConfidenceMax * availability.confidence);
  breakdown.push({ key: "availabilityConfidence", delta: confBoost });
  score += confBoost;

  // ── Soft preferences ────────────────────────────────────────────────────
  const isMorning = SHIFT_DEFS[slot.shiftType].start < "12:00";
  if (emp.onlyMornings && !isMorning) {
    breakdown.push({
      key: "violatedOnlyMornings",
      delta: WEIGHTS.preferenceViolation,
      note: "מעדיף/ה בקרים",
    });
    score += WEIGHTS.preferenceViolation;
  } else if (emp.onlyMornings && isMorning) {
    breakdown.push({ key: "preferredMornings", delta: WEIGHTS.preferenceAligned });
    score += WEIGHTS.preferenceAligned;
  }
  if (emp.onlyEvenings && isMorning) {
    breakdown.push({
      key: "violatedOnlyEvenings",
      delta: WEIGHTS.preferenceViolation,
      note: "מעדיף/ה ערבים",
    });
    score += WEIGHTS.preferenceViolation;
  } else if (emp.onlyEvenings && !isMorning) {
    breakdown.push({ key: "preferredEvenings", delta: WEIGHTS.preferenceAligned });
    score += WEIGHTS.preferenceAligned;
  }
  if (emp.noClosings && slot.isClosing) {
    breakdown.push({
      key: "violatedNoClosings",
      delta: WEIGHTS.preferenceViolation,
      note: "מעדיף/ה לא סגירות",
    });
    score += WEIGHTS.preferenceViolation;
  }

  // ── minShifts approach reward ──────────────────────────────────────────
  if (emp.minShifts != null && currentShifts < emp.minShifts) {
    breakdown.push({
      key: "approachingMin",
      delta: WEIGHTS.approachingMinShifts,
      note: `מתחת למינ' ${emp.minShifts}`,
    });
    score += WEIGHTS.approachingMinShifts;
  }

  // ── requestedShifts approach (HARD cap handled in eligibility) ──────────
  if (emp.requestedShifts != null) {
    const next = currentShifts + 1;
    if (next < emp.requestedShifts) {
      breakdown.push({
        key: "approachingRequested",
        delta: WEIGHTS.approachingRequested,
        note: `${next}/${emp.requestedShifts} מהבקשה`,
      });
      score += WEIGHTS.approachingRequested;
    } else if (next === emp.requestedShifts) {
      breakdown.push({
        key: "filledRequested",
        delta: WEIGHTS.filledRequested,
        note: `מילוי בקשת ${emp.requestedShifts} משמרות`,
      });
      score += WEIGHTS.filledRequested;
    }
  }

  return { score, breakdown };
}

// Target shifts for an employee given current state + their constraints.
// Approximate; used as a soft anchor.
function computeTargetShifts(
  emp: EmployeeProfile,
  activeEmployeeCount: number,
  totalRemainingSlots: number,
  state: AssignmentState,
): number {
  // If employee asked for a specific count, target = that.
  if (emp.requestedShifts != null) return emp.requestedShifts;
  // If employee has a min, anchor at the higher of min and even share.
  const assignedSoFar = Array.from(state.byEmployee.values()).reduce(
    (sum, arr) => sum + arr.length,
    0,
  );
  const totalSlots = assignedSoFar + totalRemainingSlots;
  const evenShare = totalSlots / Math.max(1, activeEmployeeCount);
  let target = evenShare;
  if (emp.minShifts != null) target = Math.max(target, emp.minShifts);
  if (emp.maxShifts != null) target = Math.min(target, emp.maxShifts);
  return target;
}
