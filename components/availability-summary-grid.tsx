// Global availability summary: rows = shift types × cols = days, cells list
// every employee available for that slot.

import { DAYS, DAY_NAMES_HE } from "@/lib/days";
import {
  ALL_SHIFT_TYPES,
  SHIFT_DEFS,
  ShiftType,
} from "@/lib/shifts";
import { cn } from "@/lib/utils";

export interface AvailabilityCell {
  employeeId: string;
  employeeName: string;
  employeeRole: string;
  confidence: number;
  confirmed: boolean;
  note?: string | null;
}

export interface SummaryAvailabilityRow {
  day: number;
  shiftType: string;
  cells: AvailabilityCell[];
}

export function AvailabilitySummaryGrid({
  rows,
  headcounts,
}: {
  rows: SummaryAvailabilityRow[];
  // Optional: shift template headcounts so we can show "X/Y available" per cell
  headcounts?: Map<string, number>;
}) {
  const map = new Map<string, AvailabilityCell[]>();
  for (const r of rows) {
    map.set(`${r.day}:${r.shiftType}`, r.cells);
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-slate-50">
            <th className="sticky start-0 z-10 border border-slate-100 bg-slate-50 p-2 text-start font-medium text-slate-600">
              משמרת
            </th>
            {DAYS.map((d) => (
              <th
                key={d}
                className="min-w-[110px] border border-slate-100 p-2 text-center font-medium text-slate-700"
              >
                {DAY_NAMES_HE[d]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ALL_SHIFT_TYPES.map((st) => {
            const def = SHIFT_DEFS[st];
            // If headcounts provided, skip rows with 0 across the week
            if (headcounts) {
              let any = false;
              for (const d of DAYS) {
                if ((headcounts.get(`${d}:${st}`) ?? 0) > 0) {
                  any = true;
                  break;
                }
              }
              if (!any) return null;
            }
            return (
              <tr key={st}>
                <td className="sticky start-0 z-10 whitespace-nowrap border border-slate-100 bg-white p-2 text-start align-top">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "inline-block h-2 w-2 rounded-full",
                        def.role === "kitchen"
                          ? "bg-kitchen-500"
                          : "bg-floor-500",
                      )}
                    />
                    <div>
                      <div className="font-medium text-slate-900">
                        {def.labelHe}
                      </div>
                      <div className="num text-[10px] text-slate-400">
                        {def.start}-{def.end}
                      </div>
                    </div>
                  </div>
                </td>
                {DAYS.map((d) => {
                  const cells = map.get(`${d}:${st}`) ?? [];
                  const need = headcounts?.get(`${d}:${st}`) ?? null;
                  const isClosed = need === 0;
                  return (
                    <td
                      key={d}
                      className={cn(
                        "border border-slate-100 p-1.5 align-top",
                        isClosed && "bg-slate-50",
                        def.isClosing && !isClosed && "bg-amber-50/40",
                      )}
                    >
                      {isClosed ? (
                        <div className="py-1 text-center text-[11px] text-slate-300">
                          סגור
                        </div>
                      ) : (
                        <>
                          {need != null && (
                            <div
                              className={cn(
                                "mb-1 text-center text-[10px] font-medium",
                                cells.length >= need
                                  ? "text-emerald-600"
                                  : cells.length === 0
                                    ? "text-rose-500"
                                    : "text-amber-600",
                              )}
                            >
                              <span className="num">{cells.length}</span>
                              {" / "}
                              <span className="num">{need}</span> נדרשים
                            </div>
                          )}
                          <div className="flex flex-wrap gap-1">
                            {cells.length === 0 ? (
                              <span className="text-[11px] text-slate-300">
                                —
                              </span>
                            ) : (
                              cells.map((c) => (
                                <span
                                  key={c.employeeId}
                                  className={cn(
                                    "inline-flex max-w-[135px] flex-col rounded-md px-1.5 py-0.5 text-[11px] leading-tight",
                                    !c.confirmed
                                      ? "border border-dashed border-amber-400 bg-amber-50 text-amber-700"
                                      : c.employeeRole === "kitchen"
                                        ? "bg-kitchen-50 text-kitchen-500"
                                        : c.employeeRole === "floor"
                                          ? "bg-floor-50 text-floor-500"
                                          : "bg-slate-100 text-slate-700",
                                  )}
                                  title={
                                    [
                                      !c.confirmed
                                        ? "טרם אושר"
                                        : `${Math.round(c.confidence * 100)}% ביטחון`,
                                      c.note,
                                    ]
                                      .filter(Boolean)
                                      .join(" · ")
                                  }
                                >
                                  <span className="truncate font-medium">
                                    {c.employeeName}
                                  </span>
                                  {c.note && (
                                    <span className="truncate text-[10px] opacity-70">
                                      {c.note}
                                    </span>
                                  )}
                                </span>
                              ))
                            )}
                          </div>
                        </>
                      )}
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

// Re-export for callers that might want the canonical row shape elsewhere
export type { ShiftType };
