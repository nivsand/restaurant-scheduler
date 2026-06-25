"use client";

import { useMemo, useState, useTransition } from "react";
import { DAYS, DAY_NAMES_HE, DayOfWeek } from "@/lib/days";
import {
  ALL_SHIFT_TYPES,
  SHIFT_DEFS,
  ShiftType,
} from "@/lib/shifts";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { submitAvailabilityForm } from "@/app/a/[token]/actions";

interface ExistingCell {
  day: number;
  shiftType: string;
  note?: string | null;
}

export interface HeadcountEntry {
  day: number;
  shiftType: string;
  headcount: number;
}

export function EmployeeAvailabilityForm({
  token,
  employeeId,
  weekStart,
  initialCells,
  employeeRole,
  headcounts,
  initialWeekNote,
}: {
  token?: string;
  employeeId?: string;
  weekStart: string;
  initialCells: ExistingCell[];
  employeeRole: "kitchen" | "floor" | "both";
  headcounts: HeadcountEntry[];
  initialWeekNote?: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(initialCells.map((c) => `${c.day}:${c.shiftType}`)),
  );
  const [notes, setNotes] = useState<Record<string, string>>(
    Object.fromEntries(
      initialCells
        .filter((c) => c.note)
        .map((c) => [`${c.day}:${c.shiftType}`, c.note!]),
    ),
  );
  const [weekNote, setWeekNote] = useState(initialWeekNote ?? "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const headMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const h of headcounts) m.set(`${h.day}:${h.shiftType}`, h.headcount);
    return m;
  }, [headcounts]);

  // A shift is shown for a given (day, role) if:
  //  • template headcount for that combination is > 0  (venue actually wants it), AND
  //  • the shift's role matches the employee's role (or employee is "both").
  function shiftsForDay(d: DayOfWeek): ShiftType[] {
    return ALL_SHIFT_TYPES.filter((st) => {
      const headcount = headMap.get(`${d}:${st}`) ?? 0;
      if (headcount <= 0) return false;
      const def = SHIFT_DEFS[st];
      if (employeeRole === "both") return true;
      return def.role === employeeRole;
    });
  }

  function toggle(day: DayOfWeek, shiftType: ShiftType) {
    const key = `${day}:${shiftType}`;
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function submit() {
    setError(null);
    if (selected.size === 0) {
      setError("יש לבחור לפחות משמרת אחת");
      return;
    }
    const cells = Array.from(selected).map((k) => {
      const [d, st] = k.split(":");
      const note = notes[k]?.trim() || undefined;
      return { day: parseInt(d, 10), shiftType: st, ...(note ? { note } : {}) };
    });
    const trimmedNote = weekNote.trim();
    startTransition(async () => {
      try {
        const result = await submitAvailabilityForm(
          JSON.stringify({
            ...(token ? { token } : {}),
            ...(employeeId ? { employeeId } : {}),
            weekStart,
            cells,
            ...(trimmedNote ? { weekNote: trimmedNote } : {}),
          }),
        );
        if (result?.ok) {
          window.location.href = result.redirectTo;
        }
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  // Selection helpers, scoped to role-allowed + template-active shifts.
  function selectMatching(predicate: (st: ShiftType) => boolean) {
    setSelected((s) => {
      const next = new Set(s);
      for (const d of DAYS) {
        for (const st of shiftsForDay(d as DayOfWeek)) {
          if (predicate(st)) next.add(`${d}:${st}`);
        }
      }
      return next;
    });
  }

  function clearAll() {
    setSelected(new Set());
  }

  const totalSelected = selected.size;

  // Build per-day display list once
  const perDay = DAYS.map((d) => ({
    day: d as DayOfWeek,
    shifts: shiftsForDay(d as DayOfWeek),
  }));
  const anyShiftAtAll = perDay.some((p) => p.shifts.length > 0);

  // Quick-select buttons depend on whether mornings/evenings exist for this role.
  const hasMorningsForRole = ALL_SHIFT_TYPES.some((st) => {
    const def = SHIFT_DEFS[st];
    if (employeeRole !== "both" && def.role !== employeeRole) return false;
    return def.start < "12:00";
  });
  const hasEveningsForRole = ALL_SHIFT_TYPES.some((st) => {
    const def = SHIFT_DEFS[st];
    if (employeeRole !== "both" && def.role !== employeeRole) return false;
    return def.start >= "12:00";
  });
  const hasClosingsForRole = ALL_SHIFT_TYPES.some((st) => {
    const def = SHIFT_DEFS[st];
    if (employeeRole !== "both" && def.role !== employeeRole) return false;
    return def.isClosing;
  });

  if (!anyShiftAtAll) {
    return (
      <div className="rounded-2xl border border-cream-200 bg-white p-6 text-center text-sm text-brown-500 shadow-sm">
        אין משמרות פעילות לתפקיד שלך השבוע. נסו שוב מאוחר יותר או פנו למנהל/ת.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {hasMorningsForRole && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => selectMatching((st) => SHIFT_DEFS[st].start < "12:00")}
          >
            כל הבקרים
          </Button>
        )}
        {hasEveningsForRole && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() =>
              selectMatching(
                (st) => SHIFT_DEFS[st].start >= "12:00" && !SHIFT_DEFS[st].isClosing,
              )
            }
          >
            כל הערבים (לא סגירות)
          </Button>
        )}
        {hasClosingsForRole && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => selectMatching((st) => SHIFT_DEFS[st].isClosing)}
          >
            כל הסגירות
          </Button>
        )}
        <Button type="button" size="sm" variant="ghost" onClick={clearAll}>
          נקה הכל
        </Button>
      </div>

      <div className="space-y-3">
        {perDay.map(({ day: d, shifts }) => {
          const isClosedDay = shifts.length === 0;
          return (
            <div
              key={d}
              className={cn(
                "rounded-2xl border bg-white p-3 shadow-sm",
                isClosedDay
                  ? "border-cream-200 bg-cream-50/40"
                  : "border-cream-200",
              )}
            >
              <div className="mb-2 flex items-baseline justify-between">
                <h3
                  className={cn(
                    "flex items-center gap-2 text-base font-bold",
                    isClosedDay ? "text-brown-400" : "text-brown-900",
                  )}
                >
                  {DAY_NAMES_HE[d]}
                </h3>
                {isClosedDay && (
                  <span className="text-xs text-brown-400">
                    {d === 6
                      ? "שבת — אין משמרת לתפקיד שלך"
                      : "אין משמרת לתפקיד שלך"}
                  </span>
                )}
              </div>
              {isClosedDay ? null : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {shifts.map((st) => {
                    const def = SHIFT_DEFS[st];
                    const key = `${d}:${st}`;
                    const on = selected.has(key);
                    return (
                      <div key={st} className="flex flex-col gap-1">
                        <button
                          type="button"
                          onClick={() => toggle(d, st)}
                          className={cn(
                            "flex flex-col items-start gap-0.5 rounded-xl border p-2.5 text-start transition-all active:scale-[0.98] w-full",
                            on
                              ? def.role === "kitchen"
                                ? "border-kitchen-400 bg-kitchen-50 text-kitchen-500 shadow-sm"
                                : "border-floor-400 bg-floor-50 text-floor-500 shadow-sm"
                              : "border-cream-200 bg-white text-brown-700 hover:border-cream-300",
                          )}
                        >
                          <span
                            className={cn(
                              "text-sm font-medium",
                              on && "font-semibold",
                            )}
                          >
                            {def.labelHe}
                          </span>
                          <span className="num text-xs text-brown-400">
                            {def.start}-{def.end}
                            {def.isClosing && " · סגירה"}
                          </span>
                        </button>
                        {on && (
                          <input
                            type="text"
                            value={notes[key] ?? ""}
                            onChange={(e) =>
                              setNotes((prev) => ({ ...prev, [key]: e.target.value }))
                            }
                            placeholder="הערה..."
                            maxLength={200}
                            dir="auto"
                            className="w-full rounded-lg border border-cream-200 bg-cream-50 px-2 py-1 text-xs outline-none placeholder:text-brown-400 focus:border-brand-500 focus:bg-white focus:ring-1 focus:ring-brand-500/20"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-cream-200 bg-white p-3 shadow-sm">
        <label className="mb-1.5 block text-sm font-bold text-brown-900">
          💬 הערה כללית לשבוע
        </label>
        <textarea
          value={weekNote}
          onChange={(e) => setWeekNote(e.target.value)}
          placeholder="הערה כללית למנהל/ת (לא קשורה למשמרת מסוימת)..."
          maxLength={1000}
          dir="auto"
          rows={3}
          className="w-full resize-none rounded-xl border-[1.5px] border-cream-200 bg-cream-50 px-3 py-2 text-sm outline-none placeholder:text-brown-400 focus:border-brand-500 focus:bg-white focus:ring-1 focus:ring-brand-500/20"
        />
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="sticky bottom-0 -mx-4 border-t border-cream-200 bg-white p-3 shadow-[0_-2px_8px_rgba(0,0,0,0.04)] sm:mx-0 sm:rounded-2xl sm:border sm:shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-brown-500">
            <span className="num">{totalSelected}</span> משמרות נבחרו
          </span>
          <Button onClick={submit} disabled={isPending} size="lg">
            {isPending ? "שולח..." : "שלח זמינות"}
          </Button>
        </div>
      </div>
    </div>
  );
}
