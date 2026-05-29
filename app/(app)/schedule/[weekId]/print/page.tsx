import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatWeekRange } from "@/lib/week";
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
import { PrintControls } from "@/components/print-controls";

export const metadata = {
  title: "סידור להדפסה",
};

const NOTE_KINDS = ["event", "shift_manager", "hours"] as const;

export default async function PrintSchedulePage({
  params,
}: {
  params: Promise<{ weekId: string }>;
}) {
  const { weekId } = await params;
  const session = await auth();
  const restaurantId = session!.user.restaurantId;

  const week = await prisma.week.findFirst({
    where: { id: weekId, restaurantId },
    include: { restaurant: true, overrides: true },
  });
  if (!week) notFound();

  const [templates, employees, assignments, scheduleNotes] = await Promise.all([
    prisma.shiftTemplate.findMany({ where: { restaurantId } }),
    prisma.employee.findMany({
      where: { restaurantId, archived: false },
      orderBy: { name: "asc" },
    }),
    prisma.scheduleAssignment.findMany({
      where: { weekId },
      include: { employee: true },
    }),
    prisma.scheduleNote.findMany({ where: { weekId } }),
  ]);

  // Effective headcount per (day, shiftType)
  const headMap = new Map<string, number>();
  for (const t of templates) headMap.set(`${t.day}:${t.shiftType}`, t.headcount);
  for (const o of week.overrides) headMap.set(`${o.day}:${o.shiftType}`, o.headcount);

  const cellMap = new Map<string, Array<string | null>>();
  for (const [key, n] of headMap) {
    if (n <= 0) continue;
    cellMap.set(key, new Array(n).fill(null));
  }
  for (const a of assignments) {
    const key = `${a.day}:${a.shiftType}`;
    if (!cellMap.has(key)) continue;
    const arr = cellMap.get(key)!;
    arr[a.slotIndex] = a.employee?.name ?? null;
  }

  const noteMap = new Map<string, string>();
  for (const n of scheduleNotes) noteMap.set(`${n.day}:${n.kind}`, n.content);

  const activeShiftTypes = ALL_SHIFT_TYPES.filter((st) => {
    for (const d of DAYS) if ((headMap.get(`${d}:${st}`) ?? 0) > 0) return true;
    return false;
  });

  // Per-employee summary with full 8-column breakdown
  const empCounts = new Map<
    string,
    {
      name: string;
      total: number;
      mornings: number;
      evenings: number;
      closings: number;
      weekends: number;
      noClosings: boolean;
    }
  >();
  for (const e of employees) {
    empCounts.set(e.id, {
      name: e.name,
      total: 0,
      mornings: 0,
      evenings: 0,
      closings: 0,
      weekends: 0,
      noClosings: e.noClosings,
    });
  }
  for (const a of assignments) {
    if (!a.employeeId) continue;
    const c = empCounts.get(a.employeeId);
    if (!c) continue;
    const def = SHIFT_DEFS[a.shiftType as ShiftType];
    if (!def) continue;
    c.total += 1;
    if (def.start < "12:00") c.mornings += 1;
    else c.evenings += 1;
    if (def.isClosing) c.closings += 1;
    if (a.day === 5 || a.day === 6) c.weekends += 1;
  }

  // Latest requested-shifts per employee
  const requestedByEmp = new Map<string, number | null>();
  {
    const subs = await prisma.rawSubmission.findMany({
      where: { weekId, employeeId: { not: null } },
      orderBy: { submittedAt: "desc" },
    });
    for (const s of subs) {
      if (!s.employeeId) continue;
      if (requestedByEmp.has(s.employeeId)) continue;
      requestedByEmp.set(s.employeeId, s.requestedShifts);
    }
  }

  return (
    <main className="min-h-screen bg-white text-slate-900 print:bg-white">
      {/* Toolbar — hidden during print, hidden in captured PNG */}
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 print:hidden" data-no-export>
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-2">
          <Link
            href={`/schedule/${weekId}`}
            className="text-sm text-slate-500 hover:text-slate-700"
          >
            ← חזרה לעריכה
          </Link>
          <PrintControls weekId={weekId} />
        </div>
      </div>

      <div className="mx-auto max-w-[1400px] p-6 print:p-3" dir="rtl">
        {/* Schedule area — this is what gets captured to PNG */}
        <div id="schedule-area" className="bg-white">
          <div className="mb-3 flex items-end justify-between border-b-4 border-slate-300 pb-2">
            <div>
              <h1 className="text-2xl font-bold">{week.restaurant.name}</h1>
              <p className="mt-0.5 text-sm text-slate-600">
                סידור עבודה שבועי ·{" "}
                <span className="num font-medium">
                  {formatWeekRange(week.weekStart)}
                </span>
              </p>
            </div>
            <span
              className={cn(
                "rounded-full px-3 py-1 text-xs font-bold",
                week.status === "approved"
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-amber-100 text-amber-700",
              )}
            >
              {week.status === "approved" ? "מאושר" : "טיוטה"}
            </span>
          </div>

          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className="border-2 border-slate-500 bg-slate-100 p-2 text-center font-bold">
                  משמרת
                </th>
                {DAYS.map((d) => (
                  <th
                    key={d}
                    className="border-2 border-slate-500 bg-slate-100 p-2 text-center font-bold"
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
                        "whitespace-nowrap border border-slate-500 p-2 text-center font-bold",
                        theme.labelClass,
                      )}
                    >
                      <div>{def.labelHe}</div>
                      <div className="num text-[10px] font-normal opacity-80">
                        {def.start}-{def.end}
                      </div>
                    </td>
                    {DAYS.map((d) => {
                      const need = headMap.get(`${d}:${st}`) ?? 0;
                      const cells = cellMap.get(`${d}:${st}`) ?? [];
                      if (need === 0) {
                        return (
                          <td
                            key={d}
                            className={cn(
                              "border border-slate-500 p-2 text-center text-xs font-bold",
                              theme.closedClass,
                            )}
                          >
                            סגור
                          </td>
                        );
                      }
                      return (
                        <td
                          key={d}
                          className={cn(
                            "border border-slate-500 p-1.5 text-center align-middle",
                            theme.cellClass,
                          )}
                        >
                          <ul className="space-y-0.5">
                            {cells.map((name, i) => (
                              <li
                                key={i}
                                className={cn(
                                  "leading-tight",
                                  !name && "italic text-rose-600",
                                )}
                              >
                                {name ?? "— ריק —"}
                              </li>
                            ))}
                          </ul>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}

              {/* Editable note rows: events, shift manager, hours */}
              {NOTE_KINDS.map((kind) => {
                const theme = NOTE_THEME[kind];
                return (
                  <tr key={kind}>
                    <td
                      className={cn(
                        "border border-slate-500 p-2 text-center font-bold",
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
                            "border border-slate-500 p-1.5 text-center align-middle",
                            theme.cellClass,
                          )}
                        >
                          <div className="whitespace-pre-wrap text-xs leading-tight">
                            {content || (
                              <span className="text-slate-300">—</span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Summary section — NOT included in PNG capture, only Print/PDF */}
        <div id="summary-area" className="mt-5 print:break-inside-avoid">
          <h3 className="mb-2 text-sm font-bold">סיכום לפי עובד</h3>
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="bg-slate-100">
                <th className="border-2 border-slate-400 px-2 py-1 text-center font-bold">
                  עובד
                </th>
                <th className="border-2 border-slate-400 px-2 py-1 text-center font-bold">
                  מבוקש
                </th>
                <th className="border-2 border-slate-400 px-2 py-1 text-center font-bold">
                  שובץ
                </th>
                <th className="border-2 border-slate-400 px-2 py-1 text-center font-bold">
                  בוקר
                </th>
                <th className="border-2 border-slate-400 px-2 py-1 text-center font-bold">
                  ערב
                </th>
                <th className="border-2 border-slate-400 px-2 py-1 text-center font-bold">
                  סגירות
                </th>
                <th className="border-2 border-slate-400 px-2 py-1 text-center font-bold">
                  סופ״ש
                </th>
                <th className="border-2 border-slate-400 px-2 py-1 text-center font-bold">
                  הערות
                </th>
              </tr>
            </thead>
            <tbody>
              {Array.from(empCounts.entries())
                .filter(([, c]) => c.total > 0)
                .sort(([, a], [, b]) => a.name.localeCompare(b.name, "he"))
                .map(([eid, c]) => {
                  const req = requestedByEmp.get(eid);
                  const notes: string[] = [];
                  if (req != null && c.total < req) notes.push(`חסר ${req - c.total}`);
                  if (req != null && c.total > req) notes.push(`עודף ${c.total - req}`);
                  if (c.noClosings && c.closings > 0) notes.push("סגירה למרות העדפה");
                  return (
                    <tr key={eid}>
                      <td className="border border-slate-400 px-2 py-1 text-center font-medium">
                        {c.name}
                      </td>
                      <td className="border border-slate-400 px-2 py-1 text-center num">
                        {req != null ? req : "—"}
                      </td>
                      <td className="border border-slate-400 px-2 py-1 text-center num font-semibold">
                        {c.total}
                      </td>
                      <td className="border border-slate-400 px-2 py-1 text-center num">
                        {c.mornings || "—"}
                      </td>
                      <td className="border border-slate-400 px-2 py-1 text-center num">
                        {c.evenings || "—"}
                      </td>
                      <td className="border border-slate-400 px-2 py-1 text-center num">
                        {c.closings || "—"}
                      </td>
                      <td className="border border-slate-400 px-2 py-1 text-center num">
                        {c.weekends || "—"}
                      </td>
                      <td className="border border-slate-400 px-2 py-1 text-start text-[10px] text-slate-600">
                        {notes.length > 0 ? notes.join(" · ") : "—"}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
          <div className="mt-3 text-[11px] text-slate-500">
            <p>
              מקרא:
              <span className="ms-2 inline-block h-2.5 w-2.5 rounded bg-orange-200 align-middle" />{" "}
              מטבח &nbsp;
              <span className="inline-block h-2.5 w-2.5 rounded bg-sky-200 align-middle" />{" "}
              פלור בוקר &nbsp;
              <span className="inline-block h-2.5 w-2.5 rounded bg-emerald-200 align-middle" />{" "}
              פלור ערב/סגירה &nbsp;
              <span className="inline-block h-2.5 w-2.5 rounded bg-violet-200 align-middle" />{" "}
              אירועים/מנהל &nbsp;
              <span className="inline-block h-2.5 w-2.5 rounded bg-rose-200 align-middle" />{" "}
              סגור
            </p>
            <p className="mt-2 text-[10px] text-slate-400">
              נוצר:{" "}
              <span className="num">
                {new Intl.DateTimeFormat("he-IL").format(new Date())}
              </span>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
