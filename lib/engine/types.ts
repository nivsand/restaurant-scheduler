import { DayOfWeek } from "@/lib/days";
import { ShiftType, Role } from "@/lib/shifts";

// ─── Slot definition ───────────────────────────────────────────────────────
// One row per physical slot to be filled (one row per "person needed").

export interface SlotDef {
  day: DayOfWeek;
  shiftType: ShiftType;
  slotIndex: number;          // 0..headcount-1
  isClosing: boolean;
  isFriday: boolean;
  role: "kitchen" | "floor";
}

// ─── Employee profile (read-only snapshot for the engine) ──────────────────

export interface EmployeeProfile {
  id: string;
  name: string;
  role: Role;                          // "kitchen" | "floor" | "both"
  maxShifts: number | null;            // hard cap if set
  minShifts: number | null;            // soft target (scored, not enforced)
  requestedShifts: number | null;      // HARD cap per decision 3 ("2 משמרות")
  onlyMornings: boolean;               // soft preference
  onlyEvenings: boolean;
  noClosings: boolean;
  weekendOk: boolean;                  // hard: false blocks Friday closings
}

// ─── Confirmed availability row ────────────────────────────────────────────

export interface AvailabilityRow {
  employeeId: string;
  day: DayOfWeek;
  shiftType: ShiftType;
  confidence: number;
  source: string;
}

// ─── History snapshot (rolling window) ─────────────────────────────────────

export interface HistoryStats {
  totalShifts: number;
  closingShifts: number;
  weekendShifts: number;
  morningShifts: number;
  eveningShifts: number;
  weeksObserved: number;
}

export interface HistorySnapshot {
  perEmployee: Map<string, HistoryStats>;
  groupMean: {
    totalShifts: number;
    closingShifts: number;
    weekendShifts: number;
    morningShifts: number;
    eveningShifts: number;
  };
  windowDays: number;
  weeksInWindow: number;
}

// ─── Score component (audit trail per assignment) ──────────────────────────

export interface ScoreComponent {
  key: string;
  delta: number;
  note?: string;
}

// ─── Engine input ──────────────────────────────────────────────────────────

export interface EngineInput {
  weekId: string;
  weekStart: Date;
  restaurant: {
    id: string;
    minRestHours: number;
    fairnessWindowDays: number;
    maxConsecutiveDays: number;
  };
  slots: SlotDef[];
  employees: EmployeeProfile[];
  availability: AvailabilityRow[]; // only confirmed rows
  lockedAssignments: Array<{
    day: DayOfWeek;
    shiftType: ShiftType;
    slotIndex: number;
    employeeId: string | null;
  }>;
  // Manager-defined lock-outs: engine must NOT assign these (employee, day, shiftType) triples.
  blocks: Array<{
    day: DayOfWeek;
    shiftType: ShiftType;
    employeeId: string;
  }>;
  history: HistorySnapshot;
  seed: number;
}

// ─── Engine output ─────────────────────────────────────────────────────────

export interface AssignmentDecision {
  day: DayOfWeek;
  shiftType: ShiftType;
  slotIndex: number;
  employeeId: string;
  locked: boolean;
  score: number;
  breakdown: ScoreComponent[];
  alternatives: Array<{ employeeId: string; score: number }>;
}

export interface EmptySlotReport {
  day: DayOfWeek;
  shiftType: ShiftType;
  slotIndex: number;
  severity: "warn" | "error" | "critical";
  reasonClass:
    | "no_availability"
    | "all_blocked"
    | "all_at_cap";
  blockedCandidates: Array<{
    employeeId: string;
    employeeName: string;
    reason: string;
  }>;
}

export interface EngineWarning {
  kind: string;
  severity: "info" | "warn" | "error";
  message: string;
}

export interface PerEmployeeStats {
  employeeId: string;
  employeeName: string;
  assignedShifts: number;
  requestedShifts: number | null;
  maxShifts: number | null;
  minShifts: number | null;
  closings: number;
  weekends: number;
  historyDelta: {
    total: number;
    closings: number;
    weekends: number;
  };
}

export interface EngineOutput {
  assignments: AssignmentDecision[];
  emptySlots: EmptySlotReport[];
  warnings: EngineWarning[];
  perEmployeeStats: PerEmployeeStats[];
  seed: number;
  durationMs: number;
}

// ─── Assignment state (mutable during engine run) ──────────────────────────

export interface AssignmentState {
  byEmployee: Map<string, AssignmentDecision[]>;
  bySlot: Map<string, AssignmentDecision>;
}

export function slotKey(slot: { day: number; shiftType: string; slotIndex: number }): string {
  return `${slot.day}:${slot.shiftType}:${slot.slotIndex}`;
}
