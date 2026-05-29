// Greedy initial assignment: order slots by tightness (fewest candidates
// first), then closing > non-closing, then chronological. For each slot, pick
// the highest-scoring candidate. Update state inline so later slots see the
// new assignments (affects rest-hours, same-day rules, requestedShifts cap).

import {
  AssignmentDecision,
  AssignmentState,
  AvailabilityRow,
  EmployeeProfile,
  EmptySlotReport,
  HistorySnapshot,
  SlotDef,
  slotKey,
} from "./types";
import { eligibleCandidates, checkEligibility } from "./candidates";
import { scoreCandidate } from "./score";

export interface GreedyParams {
  slots: SlotDef[];
  employees: EmployeeProfile[];
  availability: AvailabilityRow[];
  state: AssignmentState; // mutated
  history: HistorySnapshot;
  weekStart: Date;
  minRestHours: number;
  maxConsecutiveDays: number;
  rand: () => number; // for deterministic tiebreaks
  totalSlots: number;
  blocks: ReadonlyArray<{ employeeId: string; day: number; shiftType: string }>;
}

export interface GreedyResult {
  newAssignments: AssignmentDecision[];
  emptySlots: EmptySlotReport[];
}

export function runGreedy(params: GreedyParams): GreedyResult {
  const {
    slots,
    employees,
    availability,
    state,
    history,
    weekStart,
    minRestHours,
    maxConsecutiveDays,
    rand,
    totalSlots,
    blocks,
  } = params;

  // 1. Pre-compute candidate count per slot to drive ordering (snapshot —
  //    will be re-checked at assignment time).
  const initialCandidateCounts = new Map<string, number>();
  for (const slot of slots) {
    const cands = eligibleCandidates(
      slot,
      employees,
      availability,
      state,
      weekStart,
      minRestHours,
      maxConsecutiveDays,
      blocks,
    );
    initialCandidateCounts.set(slotKey(slot), cands.length);
  }

  // 2. Sort slots: ascending candidate count → closing first → day asc → slotIndex asc
  const ordered = [...slots].sort((a, b) => {
    const ca = initialCandidateCounts.get(slotKey(a)) ?? 0;
    const cb = initialCandidateCounts.get(slotKey(b)) ?? 0;
    if (ca !== cb) return ca - cb;
    if (a.isClosing !== b.isClosing) return a.isClosing ? -1 : 1;
    if (a.day !== b.day) return a.day - b.day;
    return a.slotIndex - b.slotIndex;
  });

  const activeCount = employees.length;
  const newAssignments: AssignmentDecision[] = [];
  const emptySlots: EmptySlotReport[] = [];

  let assignedCount = 0;
  for (const slot of ordered) {
    const remainingSlots = totalSlots - assignedCount;
    const candidates = eligibleCandidates(
      slot,
      employees,
      availability,
      state,
      weekStart,
      minRestHours,
      maxConsecutiveDays,
      blocks,
    );

    if (candidates.length === 0) {
      // Empty slot — capture the report
      emptySlots.push(buildEmptyReport(slot, employees, availability, state, weekStart, minRestHours, maxConsecutiveDays, blocks));
      continue;
    }

    // Score every candidate
    const scored = candidates.map((c) => {
      const avail = availability.find(
        (a) =>
          a.employeeId === c.employee.id &&
          a.day === slot.day &&
          a.shiftType === slot.shiftType,
      )!;
      const { score, breakdown } = scoreCandidate(
        c.employee,
        slot,
        avail,
        state,
        history,
        activeCount,
        remainingSlots,
      );
      return { employee: c.employee, score, breakdown, randTie: rand() };
    });

    // Sort: score desc, then deterministic-random tiebreak
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.randTie - b.randTie;
    });

    const top = scored[0];
    const alternatives = scored.slice(1, 3).map((s) => ({
      employeeId: s.employee.id,
      score: s.score,
    }));

    const decision: AssignmentDecision = {
      day: slot.day,
      shiftType: slot.shiftType,
      slotIndex: slot.slotIndex,
      employeeId: top.employee.id,
      locked: false,
      score: top.score,
      breakdown: top.breakdown,
      alternatives,
    };

    // Update state
    const empAssigns = state.byEmployee.get(top.employee.id) ?? [];
    empAssigns.push(decision);
    state.byEmployee.set(top.employee.id, empAssigns);
    state.bySlot.set(slotKey(slot), decision);

    newAssignments.push(decision);
    assignedCount += 1;
  }

  return { newAssignments, emptySlots };
}

// When a slot ends up empty, capture per-employee blocked reasons.
function buildEmptyReport(
  slot: SlotDef,
  employees: EmployeeProfile[],
  availability: AvailabilityRow[],
  state: AssignmentState,
  weekStart: Date,
  minRestHours: number,
  maxConsecutiveDays: number,
  blocks?: ReadonlyArray<{ employeeId: string; day: number; shiftType: string }>,
): EmptySlotReport {
  const blocked: EmptySlotReport["blockedCandidates"] = [];
  let anyAvailable = false;
  let allAtCap = true;

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
    if (r.eligible) continue;
    // The "no availability" reason is implicit; record it too so the manager
    // sees the full picture in the panel.
    blocked.push({
      employeeId: emp.id,
      employeeName: emp.name,
      reason: r.reason,
    });
    if (r.reason !== "לא מסומן/ת כפנוי/ה") anyAvailable = true;
    const capReasons = [
      r.reason.startsWith("מילא"),
      r.reason.startsWith("הגיע"),
    ];
    if (!capReasons.some(Boolean)) allAtCap = false;
  }

  const reasonClass: EmptySlotReport["reasonClass"] = !anyAvailable
    ? "no_availability"
    : allAtCap
      ? "all_at_cap"
      : "all_blocked";

  const severity: EmptySlotReport["severity"] = slot.isClosing
    ? "critical"
    : "error";

  return {
    day: slot.day,
    shiftType: slot.shiftType,
    slotIndex: slot.slotIndex,
    severity,
    reasonClass,
    blockedCandidates: blocked,
  };
}
