// Top-level orchestrator. Build initial state from locked assignments, run
// greedy, refine, package the output.

import { SHIFT_DEFS } from "@/lib/shifts";
import {
  AssignmentDecision,
  AssignmentState,
  EngineInput,
  EngineOutput,
  EngineWarning,
  PerEmployeeStats,
  slotKey,
} from "./types";
import { runGreedy } from "./greedy";
import { refineAssignments } from "./refine";
import { mulberry32 } from "./random";

export function runEngine(input: EngineInput): EngineOutput {
  const t0 = Date.now();
  const rand = mulberry32(input.seed);

  // Build initial state from locked assignments
  const state: AssignmentState = {
    byEmployee: new Map(),
    bySlot: new Map(),
  };
  for (const lock of input.lockedAssignments) {
    if (!lock.employeeId) continue;
    const decision: AssignmentDecision = {
      day: lock.day,
      shiftType: lock.shiftType,
      slotIndex: lock.slotIndex,
      employeeId: lock.employeeId,
      locked: true,
      score: 0,
      breakdown: [{ key: "lockedByManager", delta: 0, note: "נעול ידנית" }],
      alternatives: [],
    };
    state.bySlot.set(slotKey(lock), decision);
    const arr = state.byEmployee.get(lock.employeeId) ?? [];
    arr.push(decision);
    state.byEmployee.set(lock.employeeId, arr);
  }

  // Slots not yet locked
  const remainingSlots = input.slots.filter(
    (s) => !state.bySlot.has(slotKey(s)),
  );

  // Greedy
  const { emptySlots: initialEmpty } = runGreedy({
    slots: remainingSlots,
    employees: input.employees,
    availability: input.availability,
    state,
    history: input.history,
    weekStart: input.weekStart,
    minRestHours: input.restaurant.minRestHours,
    maxConsecutiveDays: input.restaurant.maxConsecutiveDays,
    rand,
    totalSlots: remainingSlots.length,
    blocks: input.blocks,
  });

  // Refine
  const refined = refineAssignments({
    state,
    emptySlots: initialEmpty,
    allSlots: input.slots,
    employees: input.employees,
    availability: input.availability,
    history: input.history,
    weekStart: input.weekStart,
    minRestHours: input.restaurant.minRestHours,
    maxConsecutiveDays: input.restaurant.maxConsecutiveDays,
    rand,
    blocks: input.blocks,
  });

  const finalAssignments = Array.from(refined.state.bySlot.values());
  const emptySlots = refined.emptySlots;

  // Warnings synthesis
  const warnings: EngineWarning[] = [];
  if (input.availability.length === 0) {
    warnings.push({
      kind: "no_availability",
      severity: "error",
      message: "אין נתוני זמינות לשבוע זה. הקליטו זמינות לפני יצירת סידור.",
    });
  }
  if (emptySlots.length > 0) {
    const critical = emptySlots.filter((s) => s.severity === "critical").length;
    if (critical > 0) {
      warnings.push({
        kind: "critical_empty",
        severity: "error",
        message: `${critical} משמרות סגירה חסרות אנשים`,
      });
    }
    const errors = emptySlots.filter((s) => s.severity === "error").length;
    if (errors > 0) {
      warnings.push({
        kind: "empty_slots",
        severity: "warn",
        message: `${errors} משמרות נוספות חסרות אנשים`,
      });
    }
  }

  // Per-employee stats
  const perEmployeeStats: PerEmployeeStats[] = input.employees.map((emp) => {
    const assignments = finalAssignments.filter((a) => a.employeeId === emp.id);
    const closings = assignments.filter(
      (a) => SHIFT_DEFS[a.shiftType].isClosing,
    ).length;
    const weekends = assignments.filter((a) => a.day === 5).length;
    const hist = input.history.perEmployee.get(emp.id);
    return {
      employeeId: emp.id,
      employeeName: emp.name,
      assignedShifts: assignments.length,
      requestedShifts: emp.requestedShifts,
      maxShifts: emp.maxShifts,
      minShifts: emp.minShifts,
      closings,
      weekends,
      historyDelta: {
        total: hist
          ? hist.totalShifts - input.history.groupMean.totalShifts
          : 0,
        closings: hist
          ? hist.closingShifts - input.history.groupMean.closingShifts
          : 0,
        weekends: hist
          ? hist.weekendShifts - input.history.groupMean.weekendShifts
          : 0,
      },
    };
  });

  // Add minShifts violation warnings
  for (const stat of perEmployeeStats) {
    if (
      stat.minShifts != null &&
      stat.assignedShifts < stat.minShifts
    ) {
      warnings.push({
        kind: "below_min_shifts",
        severity: "warn",
        message: `${stat.employeeName}: ${stat.assignedShifts}/${stat.minShifts} מינ' משמרות`,
      });
    }
  }

  return {
    assignments: finalAssignments,
    emptySlots,
    warnings,
    perEmployeeStats,
    seed: input.seed,
    durationMs: Date.now() - t0,
  };
}

// Multi-trial wrapper: runs the engine N times with different seeds and
// returns the best result. "Best" = fewest empty slots first, then highest
// total assignment score. Used by shuffle so the manager gets a noticeably
// better schedule than a single random seed would produce.
export function runEngineMultiTrial(
  baseInput: EngineInput,
  trials: number,
): EngineOutput {
  let best: EngineOutput | null = null;
  const baseSeed = baseInput.seed >>> 0;
  for (let i = 0; i < trials; i++) {
    const trialSeed = (baseSeed + i * 2654435761) >>> 0; // simple mixer
    const out = runEngine({ ...baseInput, seed: trialSeed });
    if (
      !best ||
      out.emptySlots.length < best.emptySlots.length ||
      (out.emptySlots.length === best.emptySlots.length &&
        sumScore(out) > sumScore(best))
    ) {
      best = out;
    }
  }
  return best!;
}

function sumScore(o: EngineOutput): number {
  return o.assignments.reduce((s, a) => s + a.score, 0);
}
