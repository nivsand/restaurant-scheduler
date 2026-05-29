// Computes concrete Date objects for shift starts/ends, given a week's Sunday
// anchor. Handles shifts that cross midnight (`endsNextDay`).

import { DayOfWeek } from "@/lib/days";
import { SHIFT_DEFS, ShiftType } from "@/lib/shifts";

export function slotDateTimes(
  weekStart: Date,
  day: DayOfWeek,
  shiftType: ShiftType,
): { start: Date; end: Date } {
  const def = SHIFT_DEFS[shiftType];
  const start = new Date(weekStart);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() + day);
  const [sh, sm] = def.start.split(":").map(Number);
  start.setHours(sh, sm, 0, 0);

  const end = new Date(start);
  if (def.endsNextDay) end.setDate(end.getDate() + 1);
  const [eh, em] = def.end.split(":").map(Number);
  end.setHours(eh, em, 0, 0);

  return { start, end };
}

// Minimum hours between two shifts (either direction).
export function restGapHours(a: { start: Date; end: Date }, b: { start: Date; end: Date }): number {
  const gap1 = (b.start.getTime() - a.end.getTime()) / 3600_000;
  const gap2 = (a.start.getTime() - b.end.getTime()) / 3600_000;
  return Math.min(Math.abs(gap1), Math.abs(gap2));
}
