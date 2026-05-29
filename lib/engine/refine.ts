// Local-search refinement after greedy. Two move types:
//   • SWAP — exchange employees of two non-locked assignments
//   • MOVE-TO-EMPTY — move an employee to an empty slot (if eligible)
// Accept if total score improves. Stop when no improvement or N iterations.

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
import { checkEligibility } from "./candidates";
import { scoreCandidate } from "./score";

const MAX_ITERATIONS = 200;
const STAGNANT_LIMIT = 40;

export interface RefineParams {
  state: AssignmentState;
  emptySlots: EmptySlotReport[];
  allSlots: SlotDef[];
  employees: EmployeeProfile[];
  availability: AvailabilityRow[];
  history: HistorySnapshot;
  weekStart: Date;
  minRestHours: number;
  maxConsecutiveDays: number;
  rand: () => number;
  blocks: ReadonlyArray<{ employeeId: string; day: number; shiftType: string }>;
}

export function refineAssignments(params: RefineParams): {
  state: AssignmentState;
  emptySlots: EmptySlotReport[];
} {
  const {
    state,
    employees,
    availability,
    history,
    weekStart,
    minRestHours,
    maxConsecutiveDays,
    rand,
    allSlots,
    blocks,
  } = params;

  let emptySlots = [...params.emptySlots];
  const activeCount = employees.length;
  const empById = new Map(employees.map((e) => [e.id, e]));

  let stagnant = 0;
  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    if (stagnant >= STAGNANT_LIMIT) break;

    const unlockedDecisions = Array.from(state.bySlot.values()).filter(
      (d) => !d.locked,
    );
    if (unlockedDecisions.length === 0) break;

    // Pick a random unlocked assignment
    const A = unlockedDecisions[Math.floor(rand() * unlockedDecisions.length)];
    const empA = empById.get(A.employeeId);
    if (!empA) {
      stagnant += 1;
      continue;
    }

    // Try MOVE-TO-EMPTY first if there are empty slots
    let improved = false;
    if (emptySlots.length > 0 && rand() < 0.5) {
      const target =
        emptySlots[Math.floor(rand() * emptySlots.length)];

      // Tentatively unassign A from its current slot, then check if A can fill
      // the target empty slot AND the original slot has any candidate.
      const origSlot = findSlot(allSlots, A);
      if (origSlot) {
        const result = tryMoveToEmpty(
          A,
          empA,
          origSlot,
          target,
          state,
          allSlots,
          employees,
          availability,
          history,
          weekStart,
          minRestHours,
          maxConsecutiveDays,
          activeCount,
          blocks,
        );
        if (result && result.totalScoreDelta > 0) {
          applyMove(state, A, result.newA, result.replacement, origSlot);
          // Remove target from emptySlots; add original if no replacement
          emptySlots = emptySlots.filter(
            (e) =>
              !(
                e.day === target.day &&
                e.shiftType === target.shiftType &&
                e.slotIndex === target.slotIndex
              ),
          );
          if (!result.replacement) {
            emptySlots.push({
              day: origSlot.day,
              shiftType: origSlot.shiftType,
              slotIndex: origSlot.slotIndex,
              severity: origSlot.isClosing ? "critical" : "error",
              reasonClass: "all_blocked",
              blockedCandidates: [],
            });
          }
          improved = true;
        }
      }
    }

    // Otherwise try SWAP with another unlocked
    if (!improved) {
      const others = unlockedDecisions.filter(
        (d) =>
          !(
            d.day === A.day &&
            d.shiftType === A.shiftType &&
            d.slotIndex === A.slotIndex
          ),
      );
      if (others.length === 0) {
        stagnant += 1;
        continue;
      }
      const B = others[Math.floor(rand() * others.length)];
      const empB = empById.get(B.employeeId);
      if (!empB) {
        stagnant += 1;
        continue;
      }

      const slotA = findSlot(allSlots, A);
      const slotB = findSlot(allSlots, B);
      if (!slotA || !slotB) {
        stagnant += 1;
        continue;
      }

      const swap = trySwap(
        A,
        B,
        empA,
        empB,
        slotA,
        slotB,
        state,
        availability,
        history,
        weekStart,
        minRestHours,
        maxConsecutiveDays,
        activeCount,
        blocks,
      );
      if (swap && swap.totalScoreDelta > 0) {
        applySwap(state, A, B, swap.newA, swap.newB);
        improved = true;
      }
    }

    if (improved) stagnant = 0;
    else stagnant += 1;
  }

  return { state, emptySlots };
}

function findSlot(
  slots: SlotDef[],
  ref: { day: number; shiftType: string; slotIndex: number },
): SlotDef | undefined {
  return slots.find(
    (s) =>
      s.day === ref.day &&
      s.shiftType === ref.shiftType &&
      s.slotIndex === ref.slotIndex,
  );
}

function tryMoveToEmpty(
  A: AssignmentDecision,
  empA: EmployeeProfile,
  origSlot: SlotDef,
  targetSlot: { day: number; shiftType: string; slotIndex: number },
  state: AssignmentState,
  allSlots: SlotDef[],
  employees: EmployeeProfile[],
  availability: AvailabilityRow[],
  history: HistorySnapshot,
  weekStart: Date,
  minRestHours: number,
  maxConsecutiveDays: number,
  activeCount: number,
  blocks: ReadonlyArray<{ employeeId: string; day: number; shiftType: string }>,
): {
  newA: AssignmentDecision;
  replacement: AssignmentDecision | null;
  totalScoreDelta: number;
} | null {
  const target = findSlot(allSlots, targetSlot);
  if (!target) return null;

  // Simulate state without A
  const simState = cloneStateWithout(state, A);

  // Is A now eligible for target?
  const aElig = checkEligibility(
    empA,
    target,
    availability,
    simState,
    weekStart,
    minRestHours,
    maxConsecutiveDays,
    blocks,
  );
  if (!aElig.eligible) return null;

  // Score A for target
  const aAvail = availability.find(
    (av) =>
      av.employeeId === empA.id &&
      av.day === target.day &&
      av.shiftType === target.shiftType,
  )!;
  const { score: newAScore, breakdown: newABreak } = scoreCandidate(
    empA,
    target,
    aAvail,
    simState,
    history,
    activeCount,
    1,
  );
  const newA: AssignmentDecision = {
    day: target.day,
    shiftType: target.shiftType,
    slotIndex: target.slotIndex,
    employeeId: empA.id,
    locked: false,
    score: newAScore,
    breakdown: newABreak,
    alternatives: [],
  };

  // Best replacement for origSlot (might be null)
  const otherCandidates = employees.filter((e) => e.id !== empA.id);
  let bestRep: AssignmentDecision | null = null;
  let bestRepScore = -Infinity;
  for (const cand of otherCandidates) {
    const r = checkEligibility(
      cand,
      origSlot,
      availability,
      simState,
      weekStart,
      minRestHours,
      maxConsecutiveDays,
      blocks,
    );
    if (!r.eligible) continue;
    const av = availability.find(
      (a) =>
        a.employeeId === cand.id &&
        a.day === origSlot.day &&
        a.shiftType === origSlot.shiftType,
    )!;
    const { score, breakdown } = scoreCandidate(
      cand,
      origSlot,
      av,
      simState,
      history,
      activeCount,
      1,
    );
    if (score > bestRepScore) {
      bestRepScore = score;
      bestRep = {
        day: origSlot.day,
        shiftType: origSlot.shiftType,
        slotIndex: origSlot.slotIndex,
        employeeId: cand.id,
        locked: false,
        score,
        breakdown,
        alternatives: [],
      };
    }
  }

  // Filling an empty slot dominates any soft-improvement swap by design.
  // 1000 chosen so that a single "fill an empty" move outweighs all routine
  // fairness / preference deltas, which sit in the ±50 range.
  const targetFillBonus = 1000;
  const repScore = bestRep ? bestRep.score : 0;
  // If the move leaves the ORIGINAL slot empty, lose half the fill bonus.
  // Net: we still prefer the move when 2 empties → 1 empty, but reject it
  // when 1 empty → 1 empty (no progress) or 0 empties → 1 empty (regression).
  const leftEmptyPenalty = bestRep ? 0 : -targetFillBonus / 2;
  const totalScoreDelta =
    newA.score + repScore - A.score + targetFillBonus + leftEmptyPenalty;

  if (totalScoreDelta <= 0) return null;
  return { newA, replacement: bestRep, totalScoreDelta };
}

function trySwap(
  A: AssignmentDecision,
  B: AssignmentDecision,
  empA: EmployeeProfile,
  empB: EmployeeProfile,
  slotA: SlotDef,
  slotB: SlotDef,
  state: AssignmentState,
  availability: AvailabilityRow[],
  history: HistorySnapshot,
  weekStart: Date,
  minRestHours: number,
  maxConsecutiveDays: number,
  activeCount: number,
  blocks: ReadonlyArray<{ employeeId: string; day: number; shiftType: string }>,
): {
  newA: AssignmentDecision;
  newB: AssignmentDecision;
  totalScoreDelta: number;
} | null {
  // Simulate state with A and B removed; verify swap feasibility for both.
  const simState = cloneStateWithout(state, A);
  const simStateWithoutB = cloneStateWithout(simState, B);

  const aOnB = checkEligibility(
    empA,
    slotB,
    availability,
    simStateWithoutB,
    weekStart,
    minRestHours,
    maxConsecutiveDays,
    blocks,
  );
  if (!aOnB.eligible) return null;

  const bOnA = checkEligibility(
    empB,
    slotA,
    availability,
    simStateWithoutB,
    weekStart,
    minRestHours,
    maxConsecutiveDays,
    blocks,
  );
  if (!bOnA.eligible) return null;

  const avA = availability.find(
    (a) =>
      a.employeeId === empA.id &&
      a.day === slotB.day &&
      a.shiftType === slotB.shiftType,
  )!;
  const avB = availability.find(
    (a) =>
      a.employeeId === empB.id &&
      a.day === slotA.day &&
      a.shiftType === slotA.shiftType,
  )!;

  const { score: newAScore, breakdown: newABreak } = scoreCandidate(
    empA,
    slotB,
    avA,
    simStateWithoutB,
    history,
    activeCount,
    1,
  );
  const { score: newBScore, breakdown: newBBreak } = scoreCandidate(
    empB,
    slotA,
    avB,
    simStateWithoutB,
    history,
    activeCount,
    1,
  );

  const totalScoreDelta = newAScore + newBScore - A.score - B.score;
  if (totalScoreDelta <= 0) return null;

  const newA: AssignmentDecision = {
    day: slotB.day,
    shiftType: slotB.shiftType,
    slotIndex: slotB.slotIndex,
    employeeId: empA.id,
    locked: false,
    score: newAScore,
    breakdown: newABreak,
    alternatives: [],
  };
  const newB: AssignmentDecision = {
    day: slotA.day,
    shiftType: slotA.shiftType,
    slotIndex: slotA.slotIndex,
    employeeId: empB.id,
    locked: false,
    score: newBScore,
    breakdown: newBBreak,
    alternatives: [],
  };

  return { newA, newB, totalScoreDelta };
}

function cloneStateWithout(
  state: AssignmentState,
  decision: AssignmentDecision,
): AssignmentState {
  const byEmployee = new Map<string, AssignmentDecision[]>();
  for (const [eid, arr] of state.byEmployee) {
    byEmployee.set(
      eid,
      arr.filter(
        (a) =>
          !(
            a.day === decision.day &&
            a.shiftType === decision.shiftType &&
            a.slotIndex === decision.slotIndex
          ),
      ),
    );
  }
  const bySlot = new Map(state.bySlot);
  bySlot.delete(slotKey(decision));
  return { byEmployee, bySlot };
}

function applySwap(
  state: AssignmentState,
  oldA: AssignmentDecision,
  oldB: AssignmentDecision,
  newA: AssignmentDecision,
  newB: AssignmentDecision,
) {
  // Remove old A, B from byEmployee
  const aArr = state.byEmployee.get(oldA.employeeId) ?? [];
  state.byEmployee.set(
    oldA.employeeId,
    aArr.filter((x) => !sameSlot(x, oldA)),
  );
  const bArr = state.byEmployee.get(oldB.employeeId) ?? [];
  state.byEmployee.set(
    oldB.employeeId,
    bArr.filter((x) => !sameSlot(x, oldB)),
  );
  // Add new
  (state.byEmployee.get(newA.employeeId) ?? []).push(newA);
  if (!state.byEmployee.has(newA.employeeId))
    state.byEmployee.set(newA.employeeId, [newA]);
  (state.byEmployee.get(newB.employeeId) ?? []).push(newB);
  if (!state.byEmployee.has(newB.employeeId))
    state.byEmployee.set(newB.employeeId, [newB]);

  // Update bySlot
  state.bySlot.set(slotKey(newA), newA);
  state.bySlot.set(slotKey(newB), newB);
}

function applyMove(
  state: AssignmentState,
  oldA: AssignmentDecision,
  newA: AssignmentDecision,
  replacement: AssignmentDecision | null,
  origSlot: SlotDef,
) {
  const aArr = state.byEmployee.get(oldA.employeeId) ?? [];
  state.byEmployee.set(
    oldA.employeeId,
    aArr.filter((x) => !sameSlot(x, oldA)),
  );
  state.bySlot.delete(slotKey(oldA));

  const aNewArr = state.byEmployee.get(newA.employeeId) ?? [];
  aNewArr.push(newA);
  state.byEmployee.set(newA.employeeId, aNewArr);
  state.bySlot.set(slotKey(newA), newA);

  if (replacement) {
    const rArr = state.byEmployee.get(replacement.employeeId) ?? [];
    rArr.push(replacement);
    state.byEmployee.set(replacement.employeeId, rArr);
    state.bySlot.set(slotKey(replacement), replacement);
  }
  // If no replacement, origSlot becomes empty — the caller updates emptySlots.
  void origSlot;
}

function sameSlot(a: AssignmentDecision, b: AssignmentDecision): boolean {
  return (
    a.day === b.day &&
    a.shiftType === b.shiftType &&
    a.slotIndex === b.slotIndex
  );
}
