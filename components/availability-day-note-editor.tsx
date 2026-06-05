"use client";

import { useTransition, useState, useEffect } from "react";
import { DAY_NAMES_HE } from "@/lib/days";
import { setAvailabilityNoteAction } from "@/app/(app)/availability/actions";

export interface DayNoteEntry {
  day: number;
  note: string | null;
}

export function AvailabilityDayNoteEditor({
  weekId,
  employeeId,
  dayNotes,
}: {
  weekId: string;
  employeeId: string;
  dayNotes: DayNoteEntry[];
}) {
  const [values, setValues] = useState<Record<number, string>>(() =>
    Object.fromEntries(dayNotes.map((d) => [d.day, d.note ?? ""])),
  );
  const [saved, setSaved] = useState<Record<number, string>>(() =>
    Object.fromEntries(dayNotes.map((d) => [d.day, d.note ?? ""])),
  );
  const [isPending, startTransition] = useTransition();

  // Sync when server re-renders with fresh data
  useEffect(() => {
    const next = Object.fromEntries(dayNotes.map((d) => [d.day, d.note ?? ""]));
    setValues(next);
    setSaved(next);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekId, employeeId]);

  if (dayNotes.length === 0) return null;

  function save(day: number) {
    const v = values[day] ?? "";
    if (v === (saved[day] ?? "")) return;
    startTransition(async () => {
      await setAvailabilityNoteAction(
        JSON.stringify({ weekId, employeeId, day, note: v }),
      );
      setSaved((prev) => ({ ...prev, [day]: v }));
    });
  }

  return (
    <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
      <p className="text-xs font-medium text-slate-500">הערות לפי יום (מופיעות בסידור)</p>
      <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {dayNotes.map(({ day }) => (
          <label key={day} className="flex items-center gap-1.5">
            <span className="w-14 shrink-0 text-xs font-medium text-slate-600">
              {DAY_NAMES_HE[day as keyof typeof DAY_NAMES_HE]}
            </span>
            <input
              type="text"
              value={values[day] ?? ""}
              onChange={(e) =>
                setValues((prev) => ({ ...prev, [day]: e.target.value }))
              }
              onBlur={() => save(day)}
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
        ))}
      </div>
    </div>
  );
}
