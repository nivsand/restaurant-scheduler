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
  cellClass: "bg-orange-100",
  labelClass: "bg-orange-200 text-orange-900",
  closedClass: "bg-rose-200 text-rose-700",
};
const BLUE: RowTheme = {
  cellClass: "bg-sky-100",
  labelClass: "bg-sky-200 text-sky-900",
  closedClass: "bg-rose-200 text-rose-700",
};
const GREEN: RowTheme = {
  cellClass: "bg-emerald-100",
  labelClass: "bg-emerald-200 text-emerald-900",
  closedClass: "bg-rose-200 text-rose-700",
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
    cellClass: "bg-violet-100",
    labelClass: "bg-violet-200 text-violet-900",
  },
  shift_manager: {
    cellClass: "bg-purple-100",
    labelClass: "bg-purple-200 text-purple-900",
  },
  hours: {
    cellClass: "bg-emerald-50",
    labelClass: "bg-emerald-100 text-emerald-800",
  },
} as const;

export const NOTE_LABELS_HE: Record<keyof typeof NOTE_THEME, string> = {
  event: "אירועים",
  shift_manager: "מנהל/ת משמרת",
  hours: "שעות",
};
