// Shift type catalog. Times are in HH:MM 24h. `endsNextDay` means it crosses midnight.
// `category` controls which template column a shift belongs to.

import { DayOfWeek } from "./days";

export type Role = "kitchen" | "floor" | "both";

export const SHIFT_TYPES = {
  MORNING_KITCHEN: "MORNING_KITCHEN",
  MORNING_FLOOR: "MORNING_FLOOR",
  EVENING_KITCHEN: "EVENING_KITCHEN",
  EVENING_FLOOR_17: "EVENING_FLOOR_17",
  CLOSING_A_19: "CLOSING_A_19",
  CLOSING_B_20: "CLOSING_B_20",
} as const;

export type ShiftType = (typeof SHIFT_TYPES)[keyof typeof SHIFT_TYPES];

export interface ShiftDef {
  id: ShiftType;
  label: string;
  labelHe: string;
  role: "kitchen" | "floor";
  start: string;
  end: string;
  endsNextDay: boolean;
  isClosing: boolean;
}

export const SHIFT_DEFS: Record<ShiftType, ShiftDef> = {
  MORNING_KITCHEN: {
    id: "MORNING_KITCHEN",
    label: "Kitchen morning",
    labelHe: "מטבח בוקר",
    role: "kitchen",
    start: "09:30",
    end: "16:00",
    endsNextDay: false,
    isClosing: false,
  },
  MORNING_FLOOR: {
    id: "MORNING_FLOOR",
    label: "Floor morning",
    labelHe: "פלור בוקר",
    role: "floor",
    start: "09:30",
    end: "17:30",
    endsNextDay: false,
    isClosing: false,
  },
  EVENING_KITCHEN: {
    id: "EVENING_KITCHEN",
    label: "Kitchen evening",
    labelHe: "מטבח ערב",
    role: "kitchen",
    start: "16:00",
    end: "01:00",
    endsNextDay: true,
    isClosing: false,
  },
  EVENING_FLOOR_17: {
    id: "EVENING_FLOOR_17",
    label: "Floor evening 17",
    labelHe: "פלור 17:00-23:00",
    role: "floor",
    start: "17:00",
    end: "23:00",
    endsNextDay: false,
    isClosing: false,
  },
  CLOSING_A_19: {
    id: "CLOSING_A_19",
    label: "Closing A (19:00)",
    labelHe: "סגירה פלור 19:00",
    role: "floor",
    start: "19:00",
    end: "01:00",
    endsNextDay: true,
    isClosing: true,
  },
  CLOSING_B_20: {
    id: "CLOSING_B_20",
    label: "Closing B (20:00)",
    labelHe: "סגירה פלור 20:00",
    role: "floor",
    start: "20:00",
    end: "01:00",
    endsNextDay: true,
    isClosing: true,
  },
};

export const ALL_SHIFT_TYPES = Object.keys(SHIFT_DEFS) as ShiftType[];

// Whether a given shift type is permitted on a given day.
// Now lenient: ANY shift on ANY day is allowed at the type level. The actual
// "is the venue open?" signal lives in the ShiftTemplate.headcount — zero
// means "no slots needed for this combination."
//
// Kept as a function (not just a constant `true`) so callers retain the right
// shape if we later add restaurant-level operating-hours rules.
export function isShiftAllowedOnDay(_shift: ShiftType, _day: DayOfWeek): boolean {
  void _shift;
  void _day;
  return true;
}

export function isClosing(shift: ShiftType): boolean {
  return SHIFT_DEFS[shift].isClosing;
}
