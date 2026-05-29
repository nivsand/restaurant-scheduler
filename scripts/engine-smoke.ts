// End-to-end engine smoke test: seeds a synthetic week, runs the engine,
// asserts hard constraints hold. Run with: npx tsx scripts/engine-smoke.ts

import { PrismaClient } from "@prisma/client";
import { loadEngineInput } from "../lib/engine/load";
import { runEngine } from "../lib/engine/run";
import { SHIFT_DEFS } from "../lib/shifts";
import { slotDateTimes, restGapHours } from "../lib/engine/datetime";
import { DAY_NAMES_HE } from "../lib/days";

const prisma = new PrismaClient();

const TEST_WEEK_OFFSET_DAYS = 14; // 2 weeks ahead — avoids real seeded data

function pad(s: string | number, w: number): string {
  const t = String(s);
  return t.length >= w ? t : t + " ".repeat(w - t.length);
}

async function main() {
  console.log("══════════════════════════════════════════════════════════════");
  console.log(" Engine smoke test");
  console.log("══════════════════════════════════════════════════════════════\n");

  const restaurant = await prisma.restaurant.findFirst();
  if (!restaurant) throw new Error("Run db:seed first.");

  // Build a synthetic week 2 weeks ahead
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  today.setDate(today.getDate() - today.getDay() + TEST_WEEK_OFFSET_DAYS);
  const weekStart = today;

  // Clean any prior test week
  const existing = await prisma.week.findUnique({
    where: {
      restaurantId_weekStart: {
        restaurantId: restaurant.id,
        weekStart,
      },
    },
  });
  if (existing) {
    await prisma.week.delete({ where: { id: existing.id } });
  }

  const week = await prisma.week.create({
    data: { restaurantId: restaurant.id, weekStart, status: "draft" },
  });
  console.log(`Created test week ${week.id} (${weekStart.toISOString().slice(0, 10)})\n`);

  const employees = await prisma.employee.findMany({
    where: { restaurantId: restaurant.id, archived: false },
    orderBy: { name: "asc" },
  });
  console.log(`Employees: ${employees.length}`);

  // Confirmed availability per employee for a realistic pattern
  type Pat = { day: number; shifts: string[] };
  function patternFor(idx: number, role: string): Pat[] {
    // Each employee available 4-5 weekdays. Rotate the off-day.
    const offDay = idx % 5; // 0..4
    const result: Pat[] = [];
    for (let d = 0; d <= 6; d++) {
      if (d === offDay) continue;
      if (role === "kitchen") {
        if (d === 5) {
          // Friday — kitchen morning only per default template
          result.push({ day: d, shifts: ["MORNING_KITCHEN"] });
          continue;
        }
        if (d === 6) {
          // Saturday — kitchen evening only per default template
          result.push({ day: d, shifts: ["EVENING_KITCHEN"] });
          continue;
        }
        result.push({
          day: d,
          shifts: ["MORNING_KITCHEN", "EVENING_KITCHEN"],
        });
      } else if (role === "floor") {
        if (d === 5) {
          // Fri morning open per default template
          result.push({ day: d, shifts: ["MORNING_FLOOR"] });
        } else if (d === 6) {
          // Sat evening open per default template
          result.push({
            day: d,
            shifts: ["EVENING_FLOOR_17", "CLOSING_A_19", "CLOSING_B_20"],
          });
        } else {
          result.push({
            day: d,
            shifts: [
              "MORNING_FLOOR",
              "EVENING_FLOOR_17",
              "CLOSING_A_19",
              "CLOSING_B_20",
            ],
          });
        }
      } else {
        // both
        if (d === 5) {
          result.push({ day: d, shifts: ["MORNING_KITCHEN", "MORNING_FLOOR"] });
        } else if (d === 6) {
          result.push({
            day: d,
            shifts: [
              "EVENING_KITCHEN",
              "EVENING_FLOOR_17",
              "CLOSING_A_19",
              "CLOSING_B_20",
            ],
          });
        } else {
          result.push({
            day: d,
            shifts: [
              "MORNING_KITCHEN",
              "MORNING_FLOOR",
              "EVENING_KITCHEN",
              "EVENING_FLOOR_17",
              "CLOSING_A_19",
              "CLOSING_B_20",
            ],
          });
        }
      }
    }
    return result;
  }

  // Seed availability
  for (let i = 0; i < employees.length; i++) {
    const emp = employees[i];
    const pats = patternFor(i, emp.role);
    for (const pat of pats) {
      for (const st of pat.shifts) {
        await prisma.parsedAvailability.create({
          data: {
            weekId: week.id,
            employeeId: emp.id,
            day: pat.day,
            shiftType: st,
            available: true,
            confidence: 1.0,
            source: "manual",
            confirmed: true,
          },
        });
      }
    }
  }

  // Give one employee a requestedShifts of 2 to exercise the HARD cap
  const first = employees[0];
  await prisma.rawSubmission.create({
    data: {
      weekId: week.id,
      employeeId: first.id,
      content: "test",
      source: "paste",
      requestedShifts: 2,
      parsedAt: new Date(),
    },
  });
  console.log(`Set requestedShifts=2 for "${first.name}" (HARD cap test)\n`);

  // ── Run engine ─────────────────────────────────────────────────────────
  const input = await loadEngineInput(week.id);
  console.log(`Slots to fill: ${input.slots.length}`);
  console.log(`Confirmed availability rows: ${input.availability.length}`);
  console.log(`History weeks observed: ${input.history.weeksInWindow}\n`);

  const t0 = Date.now();
  const output = runEngine(input);
  const elapsed = Date.now() - t0;

  console.log(`Engine ran in ${elapsed}ms`);
  console.log(`Assignments: ${output.assignments.length}`);
  console.log(`Empty slots: ${output.emptySlots.length}`);
  console.log(`Warnings: ${output.warnings.length}\n`);

  // ── Hard-constraint assertions ─────────────────────────────────────────
  let pass = 0;
  let fail = 0;

  function check(name: string, ok: boolean, detail = "") {
    const tag = ok ? "✓" : "✗";
    console.log(`  ${tag} ${name}${detail ? ` — ${detail}` : ""}`);
    if (ok) pass++;
    else fail++;
  }

  console.log("Hard-constraint checks:");

  // 1. No double-shift same day per employee
  const empDayCount = new Map<string, Map<number, number>>();
  for (const a of output.assignments) {
    const m = empDayCount.get(a.employeeId) ?? new Map();
    m.set(a.day, (m.get(a.day) ?? 0) + 1);
    empDayCount.set(a.employeeId, m);
  }
  let doubleShift = false;
  for (const [, m] of empDayCount) {
    for (const [, c] of m) if (c > 1) doubleShift = true;
  }
  check("No employee assigned twice same day", !doubleShift);

  // 2. Role match
  let roleMismatch = false;
  const empMap = new Map(input.employees.map((e) => [e.id, e]));
  for (const a of output.assignments) {
    const emp = empMap.get(a.employeeId);
    const def = SHIFT_DEFS[a.shiftType];
    if (!emp || !def) continue;
    if (emp.role !== "both" && emp.role !== def.role) {
      roleMismatch = true;
      console.log(`     ! ${emp.name} (${emp.role}) → ${def.role} shift`);
    }
  }
  check("Role matches shift", !roleMismatch);

  // 3. Has confirmed availability for each assignment
  let unavailable = false;
  for (const a of output.assignments) {
    const has = input.availability.some(
      (av) =>
        av.employeeId === a.employeeId &&
        av.day === a.day &&
        av.shiftType === a.shiftType,
    );
    if (!has) unavailable = true;
  }
  check("All assignments have confirmed availability", !unavailable);

  // 4. Rest hours respected
  let restViolation = false;
  for (const [eid, arr] of Array.from(empDayCount.keys()).map(
    (id) => [id, output.assignments.filter((a) => a.employeeId === id)] as const,
  )) {
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const t1 = slotDateTimes(input.weekStart, arr[i].day as 0, arr[i].shiftType);
        const t2 = slotDateTimes(input.weekStart, arr[j].day as 0, arr[j].shiftType);
        const gap = restGapHours(t1, t2);
        if (gap < input.restaurant.minRestHours) {
          restViolation = true;
          console.log(
            `     ! ${empMap.get(eid)?.name}: gap=${gap.toFixed(1)}h between ${arr[i].day}/${arr[i].shiftType} and ${arr[j].day}/${arr[j].shiftType}`,
          );
        }
      }
    }
  }
  check(`Rest hours ≥ ${input.restaurant.minRestHours}`, !restViolation);

  // 5. requestedShifts HARD cap honored
  const firstAssignments = output.assignments.filter(
    (a) => a.employeeId === first.id,
  );
  check(
    `requestedShifts cap (${first.name} ≤ 2)`,
    firstAssignments.length <= 2,
    `actual: ${firstAssignments.length}`,
  );

  // 6. maxShifts cap honored
  let maxExceeded = false;
  for (const emp of input.employees) {
    if (emp.maxShifts == null) continue;
    const c = output.assignments.filter((a) => a.employeeId === emp.id).length;
    if (c > emp.maxShifts) maxExceeded = true;
  }
  check("maxShifts caps honored", !maxExceeded);

  // 7. & 8. Day/shift restrictions are now driven by template headcount, not
  // hardcoded venue rules. We just check the engine never exceeds the
  // available template slots — already implicitly tested by "all assignments
  // have confirmed availability" + the candidate matrix only sources slots
  // from the template-driven SlotDef list.
  const slotCount = input.slots.length;
  check(
    "Assignments respect total slot count",
    output.assignments.length <= slotCount,
    `assigned ${output.assignments.length} of ${slotCount}`,
  );

  // 9. Determinism check: re-run with same seed → same output
  const out2 = runEngine(input);
  const assign1 = output.assignments
    .map((a) => `${a.day}:${a.shiftType}:${a.slotIndex}=${a.employeeId}`)
    .sort()
    .join("|");
  const assign2 = out2.assignments
    .map((a) => `${a.day}:${a.shiftType}:${a.slotIndex}=${a.employeeId}`)
    .sort()
    .join("|");
  check("Deterministic (same seed → same schedule)", assign1 === assign2);

  // 10. Shuffle changes output
  const shuffleInput = { ...input, seed: input.seed + 999 };
  const out3 = runEngine(shuffleInput);
  const assign3 = out3.assignments
    .map((a) => `${a.day}:${a.shiftType}:${a.slotIndex}=${a.employeeId}`)
    .sort()
    .join("|");
  check("Different seed → potentially different schedule", assign1 !== assign3 || output.assignments.length === 0);

  console.log(`\nPassed: ${pass} · Failed: ${fail}`);

  // ── Print resulting schedule ───────────────────────────────────────────
  console.log("\n──────────────────────────────────────────────────────────────");
  console.log(" Final assignments by day:");
  console.log("──────────────────────────────────────────────────────────────");

  for (let d = 0; d <= 6; d++) {
    const dayAssigns = output.assignments
      .filter((a) => a.day === d)
      .sort((a, b) => a.shiftType.localeCompare(b.shiftType) || a.slotIndex - b.slotIndex);
    if (dayAssigns.length === 0) continue;
    console.log(`\n${DAY_NAMES_HE[d as 0]}:`);
    for (const a of dayAssigns) {
      const name = empMap.get(a.employeeId)?.name ?? "?";
      const def = SHIFT_DEFS[a.shiftType];
      console.log(
        `  ${pad(def.labelHe, 22)} ${pad(name, 16)} score=${pad(a.score.toFixed(0), 5)}`,
      );
    }
  }

  // Per-employee stats
  console.log("\n──────────────────────────────────────────────────────────────");
  console.log(" Per-employee shift counts:");
  console.log("──────────────────────────────────────────────────────────────");
  for (const s of output.perEmployeeStats.sort(
    (a, b) => b.assignedShifts - a.assignedShifts,
  )) {
    const cap = s.requestedShifts ?? s.maxShifts ?? "—";
    console.log(
      `  ${pad(s.employeeName, 16)} shifts=${pad(s.assignedShifts, 3)} cap=${pad(String(cap), 4)} closings=${pad(s.closings, 2)} weekends=${s.weekends}`,
    );
  }

  // Empty slots
  if (output.emptySlots.length > 0) {
    console.log("\n──────────────────────────────────────────────────────────────");
    console.log(" Empty slots:");
    console.log("──────────────────────────────────────────────────────────────");
    for (const e of output.emptySlots) {
      console.log(
        `  ${DAY_NAMES_HE[e.day]} ${SHIFT_DEFS[e.shiftType].labelHe} #${e.slotIndex} [${e.severity}, ${e.reasonClass}]`,
      );
    }
  }

  // Cleanup
  await prisma.week.delete({ where: { id: week.id } });

  if (fail > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
