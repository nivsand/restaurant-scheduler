import { DAYS, DAY_NAMES_HE, DayOfWeek } from "@/lib/days";
import {
  ALL_SHIFT_TYPES,
  SHIFT_DEFS,
  ShiftType,
} from "@/lib/shifts";
import {
  themeForShift,
  NOTE_THEME,
  NOTE_LABELS_HE,
} from "@/lib/grid-theme";
import { cn } from "@/lib/utils";
import { ScheduleCell, SlotChip } from "@/components/schedule-cell";
import { EditableNoteCell, NoteKind } from "@/components/editable-note-cell";

export interface AssignmentRow {
  day: number;
  shiftType: string;
  slotIndex: number;
  employeeId: string | null;
  employeeName: string | null;
  locked: boolean;
  generatedScore: number | null;
  generatedBreakdown: string | null;
}

export interface HeadcountRow {
  day: number;
  shiftType: string;
  headcount: number;
}

export interface ScheduleNote {
  day: number;
  kind: string;
  content: string;
}

const NOTE_KINDS: NoteKind[] = ["event", "shift_manager", "hours"];

export function ScheduleGrid({
  areaId = "schedule-area",
  weekId,
  assignments,
  headcounts,
  notes,
  readOnly,
}: {
  areaId?: string;
  weekId: string;
  assignments: AssignmentRow[];
  headcounts: HeadcountRow[];
  notes: ScheduleNote[];
  readOnly: boolean;
}) {
  const headMap = new Map<string, number>();
  for (const h of headcounts) headMap.set(`${h.day}:${h.shiftType}`, h.headcount);

  const assignMap = new Map<string, AssignmentRow>();
  for (const a of assignments) {
    assignMap.set(`${a.day}:${a.shiftType}:${a.slotIndex}`, a);
  }

  const noteMap = new Map<string, string>();
  for (const n of notes) noteMap.set(`${n.day}:${n.kind}`, n.content);

  function chipsFor(day: number, shiftType: string): SlotChip[] {
    const count = headMap.get(`${day}:${shiftType}`) ?? 0;
    const arr: SlotChip[] = [];
    for (let i = 0; i < count; i++) {
      const a = assignMap.get(`${day}:${shiftType}:${i}`);
      arr.push({
        slotIndex: i,
        employeeId: a?.employeeId ?? null,
        employeeName: a?.employeeName ?? null,
        locked: a?.locked ?? false,
        score: a?.generatedScore ?? null,
        breakdown: a?.generatedBreakdown ?? null,
      });
    }
    return arr;
  }

  // Active shift rows (any headcount across the week)
  const activeShiftTypes = ALL_SHIFT_TYPES.filter((st) => {
    let total = 0;
    for (const d of DAYS) total += headMap.get(`${d}:${st}`) ?? 0;
    return total > 0;
  });

  return (
    <div id={areaId} className="overflow-x-auto rounded-xl bg-white">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="border border-slate-400 bg-slate-100 p-2 text-center font-bold text-slate-700">
              משמרת
            </th>
            {DAYS.map((d) => (
              <th
                key={d}
                className="min-w-[110px] border border-slate-400 bg-slate-100 p-2 text-center font-bold text-slate-700"
              >
                {DAY_NAMES_HE[d]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {activeShiftTypes.map((st) => {
            const def = SHIFT_DEFS[st];
            const theme = themeForShift(st as ShiftType);
            return (
              <tr key={st}>
                <td
                  className={cn(
                    "whitespace-nowrap border border-slate-400 p-2 text-center font-semibold",
                    theme.labelClass,
                  )}
                >
                  <div>{def.labelHe}</div>
                  <div className="num text-[10px] font-normal opacity-80">
                    {def.start}-{def.end}
                  </div>
                </td>
                {DAYS.map((d) => {
                  const headCount = headMap.get(`${d}:${st}`) ?? 0;
                  return (
                    <ScheduleCell
                      key={d}
                      weekId={weekId}
                      day={d as number}
                      shiftType={st as ShiftType}
                      isClosed={headCount === 0}
                      chips={chipsFor(d, st)}
                      readOnly={readOnly}
                      cellTint={theme.cellClass}
                      closedTint={theme.closedClass}
                    />
                  );
                })}
              </tr>
            );
          })}

          {/* Note rows: events, shift manager, hours */}
          {NOTE_KINDS.map((kind) => {
            const theme = NOTE_THEME[kind];
            return (
              <tr key={kind}>
                <td
                  className={cn(
                    "whitespace-nowrap border border-slate-400 p-2 text-center font-semibold",
                    theme.labelClass,
                  )}
                >
                  {NOTE_LABELS_HE[kind]}
                </td>
                {DAYS.map((d) => {
                  const content = noteMap.get(`${d}:${kind}`) ?? "";
                  return (
                    <td
                      key={d}
                      className={cn(
                        "border border-slate-400 p-1 align-middle",
                        theme.cellClass,
                      )}
                    >
                      <EditableNoteCell
                        weekId={weekId}
                        day={d as number}
                        kind={kind}
                        initial={content}
                        readOnly={readOnly}
                      />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
