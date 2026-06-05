// Hard-rule eligibility filter. Returns either { eligible: true, confidence }
// or { eligible: false, reason } — same function used during the greedy
// assignment AND by the "why isn't X here?" UI panel.

import { DayOfWeek } from "@/lib/days";
import { SHIFT_DEFS, ShiftType } from "@/lib/shifts";
import {
  AvailabilityRow,
  AssignmentState,
  EmployeeProfile,
  SlotDef,
} from "./types";
import { restGapHours, slotDateTimes } from "./datetime";

export interface EligibleResult {
  eligible: true;
  confidence: number;
}
// severity:
//   "hard"  — engine must never bypass; manager UI must NOT allow override
//             (role mismatch, double-shift same day)
//   "soft"  — engine respects, but manager UI shows a warning and may override
//             (no availability, rest hours, cap reached, weekend opt-out, etc.)
export interface IneligibleResult {
  eligible: false;
  reason: string;
  severity: "hard" | "soft";
}
export type EligibilityResult = EligibleResult | IneligibleResult;

export function checkEligibility(
  emp: EmployeeProfile,
  slot: SlotDef,
  availability: AvailabilityRow[],
  state: AssignmentState,
  weekStart: Date,
  minRestHours: number,
  maxConsecutiveDays: number,
  blocks?: ReadonlyArray<{ employeeId: string; day: number; shiftType: string }>,
): EligibilityResult {
  // 0. Manager-defined lock-out — HARD. Engine never overrides this.
  if (blocks) {
    for (const b of blocks) {
      if (
        b.employeeId === emp.id &&
        b.day === slot.day &&
        b.shiftType === slot.shiftType
      ) {
        return {
          eligible: false,
          reason: "חסום ידנית למשמרת זו",
          severity: "hard",
        };
      }
    }
  }

  // 1. Role match — HARD. A kitchen employee cannot fill a floor slot, ever.
  if (emp.role !== "both" && slot.role !== emp.role) {
    return { eligible: false, reason: "תפקיד לא תואם", severity: "hard" };
  }

  // 2. Not already assigned same day — HARD (cannot be in two places at once).
  const empAssigns = state.byEmployee.get(emp.id) ?? [];
  if (empAssigns.some((a) => a.day === slot.day)) {
    return {
      eligible: false,
      reason: "כבר משובץ/ת ביום זה",
      severity: "hard",
    };
  }

  // 3. weekendOk = false → can't do Friday slots. SOFT (manager can override).
  if (slot.isFriday && !emp.weekendOk) {
    return {
      eligible: false,
      reason: "לא זמין/ה לסופ״ש",
      severity: "soft",
    };
  }

  // 4. Has confirmed availability for this (day, shift). SOFT.
  const avail = availability.find(
    (a) =>
      a.employeeId === emp.id &&
      a.day === slot.day &&
      a.shiftType === slot.shiftType,
  );
  if (!avail) {
    return {
      eligible: false,
      reason: "לא מסומן/ת כפנוי/ה למשמרת זו",
      severity: "soft",
    };
  }

  // 5. Caps on shift count. SOFT (manager may want to assign anyway).
  if (emp.requestedShifts != null && empAssigns.length >= emp.requestedShifts) {
    return {
      eligible: false,
      reason: `מילא/ה בקשת ${emp.requestedShifts} משמרות`,
      severity: "soft",
    };
  }
  if (emp.maxShifts != null && empAssigns.length >= emp.maxShifts) {
    return {
      eligible: false,
      reason: `הגיע/ה למקסימום (${emp.maxShifts})`,
      severity: "soft",
    };
  }

  // 6. Rest hours. SOFT (manager may override with confirmation).
  const slotTimes = slotDateTimes(weekStart, slot.day, slot.shiftType);
  for (const other of empAssigns) {
    const otherTimes = slotDateTimes(weekStart, other.day, other.shiftType);
    const gap = restGapHours(otherTimes, slotTimes);
    if (gap < minRestHours) {
      return {
        eligible: false,
        reason: `מנוחה ${gap.toFixed(1)}ש׳ < ${minRestHours}ש׳`,
        severity: "soft",
      };
    }
  }

  // 7. Consecutive day cap. SOFT.
  if (
    wouldExceedConsecutive(
      empAssigns.map((a) => a.day),
      slot.day,
      maxConsecutiveDays,
    )
  ) {
    return {
      eligible: false,
      reason: `מעל ${maxConsecutiveDays} ימים ברצף`,
      severity: "soft",
    };
  }

  return { eligible: true, confidence: avail.confidence };
}

// Given currently assigned days + the new candidate day, would the longest
// run of consecutive days exceed the cap?
function wouldExceedConsecutive(
  assignedDays: number[],
  candidateDay: number,
  cap: number,
): boolean {
  const days = new Set([...assignedDays, candidateDay]);
  let run = 0;
  let maxRun = 0;
  for (let d = 0; d <= 6; d++) {
    if (days.has(d)) {
      run += 1;
      if (run > maxRun) maxRun = run;
    } else {
      run = 0;
    }
  }
  return maxRun > cap;
}

// Like eligibleCandidates but ignores requestedShifts and maxShifts caps.
// Used as a rescue fill after greedy+refine when slots remain empty because
// all available employees hit their requested/max count.
export function eligibleCandidatesRelaxedCaps(
  slot: SlotDef,
  employees: EmployeeProfile[],
  availability: AvailabilityRow[],
  state: AssignmentState,
  weekStart: Date,
  minRestHours: number,
  maxConsecutiveDays: number,
  blocks?: ReadonlyArray<{ employeeId: string; day: number; shiftType: string }>,
): Array<{ employee: EmployeeProfile; confidence: number }> {
  const out: Array<{ employee: EmployeeProfile; confidence: number }> = [];
  for (const emp of employees) {
    const r = checkEligibility(emp, slot, availability, state, weekStart, minRestHours, maxConsecutiveDays, blocks);
    if (r.eligible) {
      out.push({ employee: emp, confidence: r.confidence });
      continue;
    }
    // Rescue only employees blocked solely by their shift cap
    const isCapBlock = r.reason.startsWith("מילא/ה") || r.reason.startsWith("הגיע/ה");
    if (!isCapBlock) continue;
    // Re-check with caps removed — if eligible, include them
    const empNoCap: EmployeeProfile = { ...emp, requestedShifts: null, maxShifts: null };
    const r2 = checkEligibility(empNoCap, slot, availability, state, weekStart, minRestHours, maxConsecutiveDays, blocks);
    if (r2.eligible) {
      out.push({ employee: emp, confidence: r2.confidence });
    }
  }
  return out;
}

// Wrapper that returns just the eligible employees for a slot, with their
// availability confidence attached (used by the greedy stage).
export function eligibleCandidates(
  slot: SlotDef,
  employees: EmployeeProfile[],
  availability: AvailabilityRow[],
  state: AssignmentState,
  weekStart: Date,
  minRestHours: number,
  maxConsecutiveDays: number,
  blocks?: ReadonlyArray<{ employeeId: string; day: number; shiftType: string }>,
): Array<{ employee: EmployeeProfile; confidence: number }> {
  const out: Array<{ employee: EmployeeProfile; confidence: number }> = [];
  for (const emp of employees) {
    const r = checkEligibility(
      emp,
      slot,
      availability,
      state,
      weekStart,
      minRestHours,
      maxConsecutiveDays,
      blocks,
    );
    if (r.eligible) out.push({ employee: emp, confidence: r.confidence });
  }
  return out;
}

// Re-export the shift-def helper for callers that want to inspect slot meta.
export function shiftDefFor(st: ShiftType) {
  return SHIFT_DEFS[st];
}

export type { DayOfWeek };
