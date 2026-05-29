// DB-free unit test for the manager "block employee from shift" fix.
// Builds an EngineInput in memory and asserts the engine never assigns a
// blocked (employee, day, shiftType). Run: npx tsx scripts/block-test.ts
//
// This is a temporary verification harness — safe to delete.

import { runEngine } from "../lib/engine/run";
import type { EngineInput, HistorySnapshot } from "../lib/engine/types";

const emptyHistory: HistorySnapshot = {
  perEmployee: new Map(),
  groupMean: {
    totalShifts: 0,
    closingShifts: 0,
    weekendShifts: 0,
    morningShifts: 0,
    eveningShifts: 0,
  },
  windowDays: 28,
  weeksInWindow: 0,
};

function makeInput(withBlock: boolean): EngineInput {
  // One floor morning slot on Monday (day 1). Two eligible floor employees.
  return {
    weekId: "w1",
    weekStart: new Date("2026-06-01T00:00:00Z"), // a Monday-ish anchor
    restaurant: {
      id: "r1",
      minRestHours: 11,
      fairnessWindowDays: 28,
      maxConsecutiveDays: 6,
    },
    slots: [
      {
        day: 1,
        shiftType: "MORNING_FLOOR",
        slotIndex: 0,
        isClosing: false,
        isFriday: false,
        role: "floor",
      },
    ],
    employees: [
      {
        id: "alice",
        name: "Alice",
        role: "floor",
        maxShifts: null,
        minShifts: null,
        requestedShifts: null,
        onlyMornings: false,
        onlyEvenings: false,
        noClosings: false,
        weekendOk: true,
      },
      {
        id: "bob",
        name: "Bob",
        role: "floor",
        maxShifts: null,
        minShifts: null,
        requestedShifts: null,
        onlyMornings: false,
        onlyEvenings: false,
        noClosings: false,
        weekendOk: true,
      },
    ],
    availability: [
      { employeeId: "alice", day: 1, shiftType: "MORNING_FLOOR", confidence: 1, source: "manual" },
      { employeeId: "bob", day: 1, shiftType: "MORNING_FLOOR", confidence: 1, source: "manual" },
    ],
    lockedAssignments: [],
    blocks: withBlock
      ? [{ employeeId: "alice", day: 1, shiftType: "MORNING_FLOOR" }]
      : [],
    history: emptyHistory,
    seed: 12345,
  };
}

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  ok ? pass++ : fail++;
}

// Force Alice to be the highest-scored candidate by running many seeds; with a
// block in place she must NEVER appear regardless of seed.
console.log("Block-enforcement test:");
let aliceEverAssignedWhenBlocked = false;
for (let seed = 0; seed < 200; seed++) {
  const out = runEngine({ ...makeInput(true), seed });
  if (out.assignments.some((a) => a.employeeId === "alice")) {
    aliceEverAssignedWhenBlocked = true;
    break;
  }
}
check(
  "blocked employee never assigned across 200 seeds",
  !aliceEverAssignedWhenBlocked,
);

const blockedOut = runEngine(makeInput(true));
check(
  "slot still filled by the non-blocked employee",
  blockedOut.assignments.length === 1 &&
    blockedOut.assignments[0].employeeId === "bob",
  `assignments=${JSON.stringify(blockedOut.assignments.map((a) => a.employeeId))}`,
);

// Sanity: without a block, the engine is free to use either employee.
const freeOut = runEngine(makeInput(false));
check(
  "without block the slot is filled",
  freeOut.assignments.length === 1,
  `assignee=${freeOut.assignments[0]?.employeeId}`,
);

console.log(`\nPassed: ${pass} · Failed: ${fail}`);
process.exit(fail > 0 ? 1 : 0);
