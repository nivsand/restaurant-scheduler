import { prisma } from "@/lib/db";
import { mergeShiftHours, ShiftDefsMap } from "@/lib/shifts";

// Loads the effective per-shift-type hours for a restaurant: DB overrides
// (ShiftHours) merged over the SHIFT_DEFS defaults. Use this instead of
// importing the static SHIFT_DEFS directly anywhere hours are displayed or
// scheduled against.
export async function loadShiftDefs(restaurantId: string): Promise<ShiftDefsMap> {
  const rows = await prisma.shiftHours.findMany({ where: { restaurantId } });
  return mergeShiftHours(rows);
}
