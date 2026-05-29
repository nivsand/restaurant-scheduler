// History aggregation: rolling N-day window of *approved* schedules.
// Decision: only approved weeks count, so a draft schedule churn doesn't
// affect fairness math.

import { prisma } from "@/lib/db";
import { SHIFT_DEFS, ShiftType } from "@/lib/shifts";
import { HistorySnapshot, HistoryStats } from "./types";

export async function fetchHistorySnapshot(
  restaurantId: string,
  currentWeekStart: Date,
  windowDays: number,
): Promise<HistorySnapshot> {
  const windowStart = new Date(currentWeekStart);
  windowStart.setDate(windowStart.getDate() - windowDays);

  const assignments = await prisma.scheduleAssignment.findMany({
    where: {
      week: {
        restaurantId,
        weekStart: { gte: windowStart, lt: currentWeekStart },
        status: "approved",
      },
      employeeId: { not: null },
    },
    select: {
      employeeId: true,
      day: true,
      shiftType: true,
      week: { select: { weekStart: true } },
    },
  });

  const perEmployee = new Map<string, HistoryStats>();
  const weekSet = new Set<string>();

  for (const a of assignments) {
    if (!a.employeeId) continue;
    weekSet.add(a.week.weekStart.toISOString());

    const def = SHIFT_DEFS[a.shiftType as ShiftType];
    if (!def) continue;

    let stats = perEmployee.get(a.employeeId);
    if (!stats) {
      stats = {
        totalShifts: 0,
        closingShifts: 0,
        weekendShifts: 0,
        morningShifts: 0,
        eveningShifts: 0,
        weeksObserved: 0,
      };
      perEmployee.set(a.employeeId, stats);
    }
    stats.totalShifts += 1;
    if (def.isClosing) stats.closingShifts += 1;
    if (a.day === 5) stats.weekendShifts += 1;
    if (def.start < "12:00") stats.morningShifts += 1;
    else stats.eveningShifts += 1;
  }

  const weeksInWindow = weekSet.size;
  for (const stats of perEmployee.values()) {
    stats.weeksObserved = weeksInWindow;
  }

  // Group means (over employees who appear in the window).
  const empCount = perEmployee.size || 1;
  let totalShifts = 0,
    closingShifts = 0,
    weekendShifts = 0,
    morningShifts = 0,
    eveningShifts = 0;
  for (const s of perEmployee.values()) {
    totalShifts += s.totalShifts;
    closingShifts += s.closingShifts;
    weekendShifts += s.weekendShifts;
    morningShifts += s.morningShifts;
    eveningShifts += s.eveningShifts;
  }

  return {
    perEmployee,
    groupMean: {
      totalShifts: totalShifts / empCount,
      closingShifts: closingShifts / empCount,
      weekendShifts: weekendShifts / empCount,
      morningShifts: morningShifts / empCount,
      eveningShifts: eveningShifts / empCount,
    },
    windowDays,
    weeksInWindow,
  };
}

// Helper for unit tests / smoke scripts: build an empty snapshot.
export function emptyHistorySnapshot(windowDays = 28): HistorySnapshot {
  return {
    perEmployee: new Map(),
    groupMean: {
      totalShifts: 0,
      closingShifts: 0,
      weekendShifts: 0,
      morningShifts: 0,
      eveningShifts: 0,
    },
    windowDays,
    weeksInWindow: 0,
  };
}
