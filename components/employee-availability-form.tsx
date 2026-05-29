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
import { Textarea } from "@/components/ui/input";
import { submitAvailabilityForm } from "@/app/a/[token]/actions";

interface ExistingCell {
  day: number;
  shiftType: string;
}

export interface HeadcountEntry {
  day: number;
  shiftType: string;
  headcount: number;
}

export function EmployeeAvailabilityForm({
  token,
  weekStart,
  initialCells,
  initialNote,
  employeeRole,
  headcounts,
}: {
  token: string;
  weekStart: string;
  initialCells: ExistingCell[];
  initialNote: string;
  employeeRole: "kitchen" | "floor" | "both";
  headcounts: HeadcountEntry[];
}) {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(initialCells.map((c) => `${c.day}:${c.shiftType}`)),
  );
  const [note, setNote] = useState(initialNote);
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
      return { day: parseInt(d, 10), shiftType: st };
    });
    startTransition(async () => {
      try {
        const result = await submitAvailabilityForm(
          JSON.stringify({ token, weekStart, cells, note }),
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
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
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
                "rounded-2xl border bg-white p-3",
                isClosedDay
                  ? "border-slate-100 bg-slate-50/40"
                  : "border-slate-200",
              )}
            >
              <div className="mb-2 flex items-baseline justify-between">
                <h3
                  className={cn(
                    "text-base font-semibold",
                    isClosedDay ? "text-slate-400" : "text-slate-900",
                  )}
                >
                  {DAY_NAMES_HE[d]}
                </h3>
                {isClosedDay && (
                  <span className="text-xs text-slate-400">
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
                      <button
                        type="button"
                        key={st}
                        onClick={() => toggle(d, st)}
                        className={cn(
                          "flex flex-col items-start gap-0.5 rounded-xl border p-2.5 text-start transition-all active:scale-[0.98]",
                          on
                            ? def.role === "kitchen"
                              ? "border-kitchen-400 bg-kitchen-50 text-kitchen-500"
                              : "border-floor-400 bg-floor-50 text-floor-500"
                            : "border-slate-200 bg-white text-slate-700 hover:border-slate-300",
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
                        <span className="num text-xs text-slate-500">
                          {def.start}-{def.end}
                          {def.isClosing && " · סגירה"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-3">
        <label className="mb-1.5 block text-sm font-medium text-slate-700">
          הערה (אופציונלי)
        </label>
        <Textarea
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="לדוגמה: 2 משמרות מקסימום, או הערות לסידור"
        />
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="sticky bottom-0 -mx-4 border-t border-slate-200 bg-white p-3 sm:mx-0 sm:rounded-2xl sm:border">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-slate-500">
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
