"use client";

import { useTransition } from "react";
import { DAYS, DAY_NAMES_HE_SHORT, DayOfWeek } from "@/lib/days";
import {
  ALL_SHIFT_TYPES,
  SHIFT_DEFS,
  ShiftType,
  isShiftAllowedOnDay,
} from "@/lib/shifts";
import { cn } from "@/lib/utils";
import {
  toggleAvailabilityAction,
  confirmAvailabilityAction,
} from "@/app/(app)/availability/actions";

export interface ParsedRow {
  day: number;
  shiftType: string;
  available: boolean;
  confidence: number;
  source: string;
  confirmed: boolean;
  note?: string | null;
}

export function AvailabilityGrid({
  weekId,
  employeeId,
  rows,
  readOnly = false,
}: {
  weekId: string;
  employeeId: string;
  rows: ParsedRow[];
  readOnly?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const map = new Map<string, ParsedRow>();
  for (const r of rows) {
    map.set(`${r.day}:${r.shiftType}`, r);
  }

  // Click cycles: empty → confirmed; unconfirmed → confirmed; confirmed → empty.
  function toggle(day: DayOfWeek, shiftType: ShiftType) {
    if (readOnly) return;
    const existing = map.get(`${day}:${shiftType}`);
    startTransition(async () => {
      if (!existing) {
        await toggleAvailabilityAction(
          JSON.stringify({ weekId, employeeId, day, shiftType, setAvailable: true }),
        );
      } else if (!existing.confirmed) {
        await confirmAvailabilityAction(
          JSON.stringify({ weekId, employeeId, day, shiftType }),
        );
      } else {
        await toggleAvailabilityAction(
          JSON.stringify({ weekId, employeeId, day, shiftType, setAvailable: false }),
        );
      }
    });
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-[420px] border-collapse text-xs">
        <thead>
          <tr>
            <th className="p-1 text-start font-medium text-brown-500"></th>
            {DAYS.map((d) => (
              <th
                key={d}
                className="min-w-[36px] p-1 text-center font-medium text-brown-600"
              >
                {DAY_NAMES_HE_SHORT[d]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ALL_SHIFT_TYPES.map((st) => {
            const def = SHIFT_DEFS[st];
            return (
              <tr key={st}>
                <td className="whitespace-nowrap p-1 text-start text-brown-600">
                  <span className="inline-flex items-center gap-1">
                    <span
                      className={cn(
                        "inline-block h-2 w-2 rounded-full",
                        def.role === "kitchen"
                          ? "bg-kitchen-500"
                          : "bg-floor-500",
                      )}
                    />
                    <span className="text-xs">{def.labelHe}</span>
                  </span>
                </td>
                {DAYS.map((d) => {
                  const allowed = isShiftAllowedOnDay(st, d);
                  const row = map.get(`${d}:${st}`);
                  return (
                    <td key={d} className="p-0.5 text-center">
                      <button
                        type="button"
                        onClick={() => toggle(d as DayOfWeek, st)}
                        disabled={readOnly || isPending || !allowed}
                        title={
                          row
                            ? `${Math.round(row.confidence * 100)}% · ${row.source}${row.note ? ` · ${row.note}` : ""}`
                            : allowed
                              ? "לחץ להוספה"
                              : "סגור"
                        }
                        className={cn(
                          "h-7 w-9 rounded-md text-xs transition-all",
                          !allowed && "bg-cream-100 text-brown-400",
                          allowed && !row && "border border-cream-200 hover:bg-cream-50",
                          allowed && row && cellClass(row),
                          readOnly && "cursor-default",
                        )}
                      >
                        {row ? "✓" : ""}
                      </button>
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

function cellClass(row: ParsedRow): string {
  if (row.source === "manual" && row.confirmed) {
    return "bg-brand-500 text-white shadow-sm";
  }
  // Unconfirmed cells render hollow with a dashed border to flag manager review.
  if (!row.confirmed) {
    if (row.confidence >= 0.85) {
      return "border-2 border-dashed border-emerald-500 bg-emerald-50 text-emerald-700";
    }
    if (row.confidence >= 0.6) {
      return "border-2 border-dashed border-amber-500 bg-amber-50 text-amber-700";
    }
    return "border-2 border-dashed border-rose-500 bg-rose-50 text-rose-700";
  }
  if (row.confidence >= 0.85) return "bg-emerald-500 text-white";
  if (row.confidence >= 0.6) return "bg-amber-400 text-white";
  return "bg-rose-500 text-white";
}
