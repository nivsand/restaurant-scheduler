import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatWeekRange } from "@/lib/week";
import { SHIFT_DEFS, ShiftType } from "@/lib/shifts";
import { cn } from "@/lib/utils";
import { PrintControls } from "@/components/print-controls";
import { ScheduleGrid } from "@/components/schedule-grid";

export const metadata = {
  title: "סידור להדפסה",
};

const PDF_PAGE_ISOLATION_CSS = `
  @media screen, print {
    html, body {
      background: #fff !important;
      direction: rtl;
      margin: 0 !important;
    }

    body:has(#schedule-area) * {
      visibility: hidden !important;
    }

    body:has(#schedule-area) #schedule-area,
    body:has(#schedule-area) #schedule-area * {
      visibility: visible !important;
    }

    body:has(#schedule-area) #schedule-area {
      position: absolute !important;
      inset: 0 0 auto 0 !important;
      margin: 0 !important;
      max-width: none !important;
      overflow: visible !important;
      width: 100% !important;
    }
  }
`;

export default async function PrintSchedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ weekId: string }>;
  searchParams?: Promise<{ pdf?: string }>;
}) {
  const { weekId } = await params;
  const isPdfMode = (await searchParams)?.pdf === "1";
  const session = await auth();
  if (!session?.user?.restaurantId) redirect("/login");
  const restaurantId = session.user.restaurantId;

  const week = await prisma.week.findFirst({
    where: { id: weekId, restaurantId },
    include: { restaurant: true, overrides: true },
  });
  if (!week) notFound();

  const [templates, employees, assignments, scheduleNotes, parsed] = await Promise.all([
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
    prisma.parsedAvailability.findMany({
      where: { weekId, confirmed: true },
    }),
  ]);

  // Effective headcount per (day, shiftType)
  const headMap = new Map<string, number>();
  for (const t of templates) headMap.set(`${t.day}:${t.shiftType}`, t.headcount);
  for (const o of week.overrides) headMap.set(`${o.day}:${o.shiftType}`, o.headcount);
  const headcounts = Array.from(headMap.entries()).map(([key, headcount]) => {
    const [day, shiftType] = key.split(":");
    return { day: Number(day), shiftType, headcount };
  });
  const availabilityNoteMap = new Map<string, string>();
  for (const row of parsed) {
    const note = row.note?.trim();
    if (!note) continue;
    availabilityNoteMap.set(
      `${row.employeeId}:${row.day}:${row.shiftType}`,
      note,
    );
  }
  const assignmentRows = assignments.map((assignment) => ({
    day: assignment.day,
    shiftType: assignment.shiftType,
    slotIndex: assignment.slotIndex,
    employeeId: assignment.employeeId,
    employeeName: assignment.employee?.name ?? null,
    employeeNote: assignment.employeeId
      ? availabilityNoteMap.get(
          `${assignment.employeeId}:${assignment.day}:${assignment.shiftType}`,
        ) ?? null
      : null,
    locked: assignment.locked,
    generatedScore: assignment.generatedScore,
    generatedBreakdown: assignment.generatedBreakdown,
  }));

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
      {isPdfMode && (
        <style dangerouslySetInnerHTML={{ __html: PDF_PAGE_ISOLATION_CSS }} />
      )}
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
        {/* Schedule area — PDF and PNG export this same visual grid. */}
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

          <ScheduleGrid
            areaId="schedule-grid"
            weekId={weekId}
            assignments={assignmentRows}
            headcounts={headcounts}
            notes={scheduleNotes.map((note) => ({
              day: note.day,
              kind: note.kind,
              content: note.content,
            }))}
            readOnly
            cleanExport
          />
        </div>

        {/* Summary section — visible on the print view, excluded from PDF/PNG captures. */}
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
