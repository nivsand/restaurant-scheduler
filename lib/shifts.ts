// Shift type catalog. Times are in HH:MM 24h. `endsNextDay` means it crosses midnight.
// `category` controls which template column a shift belongs to.
//
// start/end/endsNextDay here are DEFAULTS ONLY — actual per-restaurant hours
// are editable from the Shift Template page (ShiftHours table) and resolved
// via lib/shift-hours.ts loadShiftDefs(). role/labelHe/isClosing are fixed
// metadata, not configurable. Everywhere that displays or schedules against
// shift hours should use the resolved map, not this static catalog directly.

import { DayOfWeek } from "./days";

export type Role = "kitchen" | "floor" | "both";

export const SHIFT_TYPES = {
  MORNING_KITCHEN: "MORNING_KITCHEN",
  MORNING_FLOOR: "MORNING_FLOOR",
  EVENING_KITCHEN: "EVENING_KITCHEN",
  EVENING_FLOOR_17: "EVENING_FLOOR_17",
  CLOSING_A_19: "CLOSING_A_19",
  CLOSING_B_20: "CLOSING_B_20",
  SHIFT_MANAGER: "SHIFT_MANAGER",
} as const;

export type ShiftType = (typeof SHIFT_TYPES)[keyof typeof SHIFT_TYPES];

export interface ShiftDef {
  id: ShiftType;
  label: string;
  labelHe: string;
  // "shift_manager" is an additional capability, not a Floor/Kitchen role —
  // eligibility for it is gated by Employee.shiftManager, not Employee.role.
  role: "kitchen" | "floor" | "shift_manager";
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
  SHIFT_MANAGER: {
    id: "SHIFT_MANAGER",
    label: "Shift Manager",
    labelHe: "מנהל/ת משמרת",
    role: "shift_manager",
    start: "16:00",
    end: "23:30",
    endsNextDay: false,
    isClosing: false,
  },
};

export const ALL_SHIFT_TYPES = Object.keys(SHIFT_DEFS) as ShiftType[];

// ─── Per-restaurant resolved hours ─────────────────────────────────────────

export type ShiftDefsMap = Record<ShiftType, ShiftDef>;

// Merges ShiftHours rows (DB overrides) over the static SHIFT_DEFS defaults.
// Any shift type missing a row (e.g. a brand-new restaurant, or one created
// before backfill) falls back to the hardcoded default — never throws.
export function mergeShiftHours(
  rows: Array<{ shiftType: string; start: string; end: string; endsNextDay: boolean }>,
): ShiftDefsMap {
  const overrides = new Map(rows.map((r) => [r.shiftType, r]));
  const out = {} as ShiftDefsMap;
  for (const st of ALL_SHIFT_TYPES) {
    const o = overrides.get(st);
    out[st] = o
      ? { ...SHIFT_DEFS[st], start: o.start, end: o.end, endsNextDay: o.endsNextDay }
      : SHIFT_DEFS[st];
  }
  return out;
}

// Sentinel "shiftType" used to store a free-text general weekly note on the
// employee availability form. Stored as a ParsedAvailability row (day 0,
// available=false) so it rides along with per-shift cells without a schema
// change. Always excluded from ALL_SHIFT_TYPES-based engine/UI loops.
export const WEEK_NOTE_SHIFT_TYPE = "WEEK_NOTE";

// Friday "פלור בוקר" split-cell display: when both slots of MORNING_FLOOR on
// Friday (day 5) are filled, the cell shows two employees stacked with a
// divider, each annotated with a start time. Times default to these values
// and are editable per-week (stored as ScheduleNote rows, kind
// "floor_split_0"/"floor_split_1", day 5).
export const FRIDAY_FLOOR_SPLIT_DAY = 5;
export const FRIDAY_FLOOR_SPLIT_SHIFT_TYPE: ShiftType = "MORNING_FLOOR";
export const FRIDAY_FLOOR_SPLIT_DEFAULT_TIMES: [string, string] = ["11:00", "13:00"];

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
