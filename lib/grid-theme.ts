// Visual theme for the schedule grid (editor + print views).
// Maps shift types and note kinds to consistent row/cell color schemes that
// mirror the reference board layout.

import { ShiftType } from "@/lib/shifts";

export interface RowTheme {
  // Applied to <td> elements in this row (cells get a faint tint).
  cellClass: string;
  // Header column label tint (heavier).
  labelClass: string;
  // Class for closed cells in this row (headcount = 0 for that day).
  closedClass: string;
}

const ORANGE: RowTheme = {
  cellClass: "bg-orange-200",
  labelClass: "bg-orange-300 text-orange-950",
  closedClass: "bg-rose-300 text-rose-800",
};
const BLUE: RowTheme = {
  cellClass: "bg-sky-200",
  labelClass: "bg-sky-300 text-sky-950",
  closedClass: "bg-rose-300 text-rose-800",
};
const GREEN: RowTheme = {
  cellClass: "bg-emerald-200",
  labelClass: "bg-emerald-300 text-emerald-950",
  closedClass: "bg-rose-300 text-rose-800",
};

export function themeForShift(st: ShiftType): RowTheme {
  switch (st) {
    case "MORNING_KITCHEN":
    case "EVENING_KITCHEN":
      return ORANGE;
    case "MORNING_FLOOR":
      return BLUE;
    case "EVENING_FLOOR_17":
    case "CLOSING_A_19":
    case "CLOSING_B_20":
      return GREEN;
    default:
      return GREEN;
  }
}

// Note rows
export const NOTE_THEME = {
  event: {
    cellClass: "bg-violet-200",
    labelClass: "bg-violet-300 text-violet-950",
  },
  shift_manager: {
    cellClass: "bg-purple-200",
    labelClass: "bg-purple-300 text-purple-950",
  },
  hours: {
    cellClass: "bg-emerald-100",
    labelClass: "bg-emerald-200 text-emerald-900",
  },
} as const;

export const NOTE_LABELS_HE: Record<keyof typeof NOTE_THEME, string> = {
  event: "אירועים",
  shift_manager: "מנהל/ת משמרת",
  hours: "שעות",
};
