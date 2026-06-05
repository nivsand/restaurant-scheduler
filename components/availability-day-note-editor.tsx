"use client";

import { useTransition, useState, useEffect } from "react";
import { DAY_NAMES_HE, DAYS } from "@/lib/days";
import { SHIFT_DEFS, ShiftType } from "@/lib/shifts";
import { setAvailabilityNoteAction } from "@/app/(app)/availability/actions";

export interface ShiftNoteEntry {
  day: number;
  shiftType: string;
  note: string | null;
}

// Kept old export name so the import in review/page.tsx compiles without
// renaming; the component is now shift-scoped, not day-scoped.
export type DayNoteEntry = ShiftNoteEntry;

export function AvailabilityShiftNoteEditor({
  weekId,
  employeeId,
  shiftNotes,
}: {
  weekId: string;
  employeeId: string;
  shiftNotes: ShiftNoteEntry[];
}) {
  const initMap = () =>
    Object.fromEntries(
      shiftNotes.map((s) => [`${s.day}:${s.shiftType}`, s.note ?? ""]),
    );

  const [values, setValues] = useState<Record<string, string>>(initMap);
  const [saved, setSaved] = useState<Record<string, string>>(initMap);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const m = initMap();
    setValues(m);
    setSaved(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekId, employeeId]);

  if (shiftNotes.length === 0) return null;

  function save(day: number, shiftType: string) {
    const key = `${day}:${shiftType}`;
    const v = values[key] ?? "";
    if (v === (saved[key] ?? "")) return;
    startTransition(async () => {
      await setAvailabilityNoteAction(
        JSON.stringify({ weekId, employeeId, day, shiftType, note: v }),
      );
      setSaved((prev) => ({ ...prev, [key]: v }));
    });
  }

  // Group entries by day for a clean display
  const byDay = new Map<number, ShiftNoteEntry[]>();
  for (const e of shiftNotes) {
    const arr = byDay.get(e.day) ?? [];
    arr.push(e);
    byDay.set(e.day, arr);
  }
  const orderedDays = ([...DAYS] as number[]).filter((d) => byDay.has(d));

  return (
    <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
      <p className="text-xs font-medium text-slate-500">
        הערות לפי משמרת (מופיעות בסידור)
      </p>
      {orderedDays.map((day) => (
        <div key={day} className="space-y-1.5">
          <p className="text-[11px] font-semibold text-slate-600">
            {DAY_NAMES_HE[day as keyof typeof DAY_NAMES_HE]}
          </p>
          {byDay.get(day)!.map(({ shiftType }) => {
            const def = SHIFT_DEFS[shiftType as ShiftType];
            const key = `${day}:${shiftType}`;
            return (
              <label key={shiftType} className="flex items-center gap-2">
                <span className="w-28 shrink-0 text-[11px] text-slate-500">
                  {def?.labelHe ?? shiftType}
                </span>
                <input
                  type="text"
                  value={values[key] ?? ""}
                  onChange={(e) =>
                    setValues((prev) => ({ ...prev, [key]: e.target.value }))
                  }
                  onBlur={() => save(day, shiftType)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                  }}
                  placeholder="הוסף הערה..."
                  disabled={isPending}
                  maxLength={200}
                  dir="auto"
                  className="min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs outline-none transition placeholder:text-slate-300 focus:border-brand-400 focus:ring-1 focus:ring-brand-200 disabled:opacity-60"
                />
              </label>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// Legacy alias kept so existing code compiles without renaming.
export const AvailabilityDayNoteEditor = AvailabilityShiftNoteEditor;
