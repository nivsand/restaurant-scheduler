// Loads everything the engine needs from the DB into a single EngineInput.
// Pure wrapping around Prisma queries — kept separate so the engine itself
// stays testable without DB access.

import { prisma } from "@/lib/db";
import { DayOfWeek } from "@/lib/days";
import {
  ALL_SHIFT_TYPES,
  SHIFT_DEFS,
  ShiftType,
  isShiftAllowedOnDay,
} from "@/lib/shifts";
import { fetchHistorySnapshot } from "./history";
import { seedFromString } from "./random";
import {
  AvailabilityRow,
  EmployeeProfile,
  EngineInput,
  SlotDef,
} from "./types";

export async function loadEngineInput(
  weekId: string,
  overrideSeed?: number,
): Promise<EngineInput> {
  const week = await prisma.week.findUniqueOrThrow({
    where: { id: weekId },
    include: { restaurant: true, overrides: true },
  });

  const restaurantId = week.restaurantId;

  // ── Slots: template × per-week overrides, expanded per headcount ────────
  const [templates, employees, availability, lockedAssignments, blocksRows] =
    await Promise.all([
      prisma.shiftTemplate.findMany({ where: { restaurantId } }),
      prisma.employee.findMany({
        where: { restaurantId, archived: false },
        orderBy: { name: "asc" },
      }),
      prisma.parsedAvailability.findMany({
        where: { weekId, confirmed: true },
      }),
      prisma.scheduleAssignment.findMany({
        where: { weekId, locked: true },
      }),
      prisma.scheduleBlock.findMany({ where: { weekId } }),
    ]);

  const blocks = blocksRows.map((b) => ({
    day: b.day as DayOfWeek,
    shiftType: b.shiftType as ShiftType,
    employeeId: b.employeeId,
  }));

  // Build headcount map: (day, shiftType) → headcount, with overrides applied
  const headcountMap = new Map<string, number>();
  for (const t of templates) {
    headcountMap.set(`${t.day}:${t.shiftType}`, t.headcount);
  }
  for (const o of week.overrides) {
    headcountMap.set(`${o.day}:${o.shiftType}`, o.headcount);
  }

  const slots: SlotDef[] = [];
  for (const [key, count] of headcountMap) {
    if (count <= 0) continue;
    const [dayStr, shiftType] = key.split(":") as [string, ShiftType];
    const day = parseInt(dayStr, 10) as DayOfWeek;
    if (!isShiftAllowedOnDay(shiftType, day)) continue;
    const def = SHIFT_DEFS[shiftType];
    if (!def) continue;
    for (let i = 0; i < count; i++) {
      slots.push({
        day,
        shiftType,
        slotIndex: i,
        isClosing: def.isClosing,
        isFriday: day === 5,
        role: def.role,
      });
    }
  }

  // ── Employee profiles + requestedShifts from latest submission ──────────
  // Latest submission per employee for this week
  const submissions = await prisma.rawSubmission.findMany({
    where: { weekId, employeeId: { not: null } },
    orderBy: { submittedAt: "desc" },
  });
  const requestedByEmp = new Map<string, number>();
  for (const s of submissions) {
    if (!s.employeeId) continue;
    if (requestedByEmp.has(s.employeeId)) continue; // earliest in desc = latest
    if (s.requestedShifts != null) {
      requestedByEmp.set(s.employeeId, s.requestedShifts);
    }
  }

  const empProfiles: EmployeeProfile[] = employees.map((e) => ({
    id: e.id,
    name: e.name,
    role: e.role as "kitchen" | "floor" | "both",
    maxShifts: e.maxShifts,
    minShifts: e.minShifts,
    requestedShifts: requestedByEmp.get(e.id) ?? null,
    onlyMornings: e.onlyMornings,
    onlyEvenings: e.onlyEvenings,
    noClosings: e.noClosings,
    weekendOk: e.weekendOk,
  }));

  // ── Availability ───────────────────────────────────────────────────────
  const availRows: AvailabilityRow[] = availability
    .filter((a) => ALL_SHIFT_TYPES.includes(a.shiftType as ShiftType))
    .map((a) => ({
      employeeId: a.employeeId,
      day: a.day as DayOfWeek,
      shiftType: a.shiftType as ShiftType,
      confidence: a.confidence,
      source: a.source,
    }));

  // ── Locked assignments ─────────────────────────────────────────────────
  const locked = lockedAssignments
    .filter((a) => a.employeeId != null)
    .map((a) => ({
      day: a.day as DayOfWeek,
      shiftType: a.shiftType as ShiftType,
      slotIndex: a.slotIndex,
      employeeId: a.employeeId!,
    }));

  // ── History snapshot ───────────────────────────────────────────────────
  const history = await fetchHistorySnapshot(
    restaurantId,
    week.weekStart,
    week.restaurant.fairnessWindowDays,
  );

  // ── Seed ───────────────────────────────────────────────────────────────
  const seed = overrideSeed ?? seedFromString(weekId);

  return {
    weekId,
    weekStart: week.weekStart,
    restaurant: {
      id: restaurantId,
      minRestHours: week.restaurant.minRestHours,
      fairnessWindowDays: week.restaurant.fairnessWindowDays,
      maxConsecutiveDays: week.restaurant.maxConsecutiveDays,
    },
    slots,
    employees: empProfiles,
    availability: availRows,
    lockedAssignments: locked,
    blocks,
    history,
    seed,
  };
}
