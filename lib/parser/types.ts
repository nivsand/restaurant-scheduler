import { DayOfWeek } from "@/lib/days";
import { ShiftType } from "@/lib/shifts";

// One concrete (day, shiftType) availability assertion, with provenance.
export interface ParsedAvailabilityRow {
  day: DayOfWeek;
  shiftType: ShiftType;
  available: boolean;
  confidence: number; // 0..1
  note?: string;
  source: "rule" | "llm" | "form" | "manual";
}

// What a single text line was understood to express.
export interface ParsedLine {
  raw: string;
  normalized: string;
  dayMatches: DayMatch[];
  shiftMatches: ShiftMatch[];
  modifiers: ParsedModifier[];
  specialTokens: SpecialToken[];
  notes: string[];
  confidence: number; // line-level rollup
  needsLlm: boolean;
}

export interface DayMatch {
  day: DayOfWeek;
  source: string;
  confidence: number;
}

export interface ShiftMatch {
  // Family describes the rough kind ("morning", "evening", "closing", "any").
  // The concrete ShiftType list is computed later based on employee role and day.
  family: ShiftFamily;
  // If true, multiple families are possible (eg "morning/evening" = either).
  isEitherOr?: boolean;
  // Specific shift types if known precisely (eg "פתיחה" → opening shift = MORNING_*).
  specificShifts?: ShiftType[];
  source: string;
  confidence: number;
}

export type ShiftFamily =
  | "morning"
  | "evening"
  | "closing"   // any closing
  | "opening"   // morning + bar opening
  | "any"       // full availability for the day
  | "morningOrEvening";

export interface ParsedModifier {
  kind:
    | "fromTime"
    | "untilTime"
    | "arriveTime"
    | "shiftCount"
    | "minShiftCount"
    | "preferEvenings"
    | "preferMornings"
    | "noClosings"
    | "anyTime";
  value?: string | number;
  source: string;
}

export interface SpecialToken {
  kind: "motzash" | "shishi_shabbat" | "weekend" | "kol_hayom";
  source: string;
  confidence: number;
}

// What the whole message expresses.
export interface ParsedMessage {
  rawText: string;
  lines: ParsedLine[];
  rows: ParsedAvailabilityRow[]; // expanded final availability assertions
  requestedShifts?: number;
  warnings: string[];
  meanConfidence: number;
  needsLlm: boolean;
}
