import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatWeekParam, formatWeekRange } from "@/lib/week";
import { ScheduleGrid } from "@/components/schedule-grid";
import { ScheduleControls } from "@/components/schedule-controls";
import { ScheduleExportRow } from "@/components/schedule-export-row";
import { WeekPicker } from "@/components/week-picker";
import {
  AvailabilitySummaryGrid,
  type SummaryAvailabilityRow,
} from "@/components/availability-summary-grid";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SHIFT_DEFS, ShiftType, isShiftAllowedOnDay, WEEK_NOTE_SHIFT_TYPE } from "@/lib/shifts";
import { DAYS, DAY_NAMES_HE, DayOfWeek } from "@/lib/days";
import { cn } from "@/lib/utils";

export default async function ScheduleEditorPage({
  params,
}: {
  params: Promise<{ weekId: string }>;
}) {
  const { weekId } = await params;
  const session = await auth();
  if (!session?.user?.restaurantId) redirect("/login");
  const restaurantId = session.user.restaurantId;

  const week = await prisma.week.findFirst({
    where: { id: weekId, restaurantId },
    include: {
      restaurant: true,
      overrides: true,
    },
  });
  if (!week) notFound();

  const [templates, employees, assignments, parsed, lastGen, scheduleNotes] =
    await Promise.all([
      prisma.shiftTemplate.findMany({ where: { restaurantId } }),
      prisma.employee.findMany({
        where: { restaurantId, archived: false },
        orderBy: { name: "asc" },
      }),
      prisma.scheduleAssignment.findMany({
        where: { weekId },
        include: { employee: true },
      }),
      prisma.parsedAvailability.findMany({
        where: { weekId, confirmed: true },
      }),
      prisma.auditLog.findFirst({
        where: { weekId, action: "generate_schedule" },
        orderBy: { createdAt: "desc" },
      }),
      prisma.scheduleNote.findMany({ where: { weekId } }),
    ]);

  // Headcounts: template overridden by week overrides
  const headMap = new Map<string, number>();
  for (const t of templates) headMap.set(`${t.day}:${t.shiftType}`, t.headcount);
  for (const o of week.overrides) headMap.set(`${o.day}:${o.shiftType}`, o.headcount);

  const headcounts = Array.from(headMap.entries()).map(([k, headcount]) => {
    const [day, shiftType] = k.split(":");
    return { day: parseInt(day, 10), shiftType, headcount };
  });

  const employeeById = new Map(employees.map((e) => [e.id, e]));
  const availabilityNoteMap = new Map<string, string>();
  const availabilityRowsByKey = new Map<string, SummaryAvailabilityRow>();
  for (const p of parsed) {
    if (p.shiftType === WEEK_NOTE_SHIFT_TYPE) continue;
    const note = p.note?.trim() || null;
    if (note) {
      availabilityNoteMap.set(
        `${p.employeeId}:${p.day}:${p.shiftType}`,
        note,
      );
    }
    const employee = employeeById.get(p.employeeId);
    if (!employee) continue;
    const key = `${p.day}:${p.shiftType}`;
    const row =
      availabilityRowsByKey.get(key) ??
      ({
        day: p.day,
        shiftType: p.shiftType,
        cells: [],
      } satisfies SummaryAvailabilityRow);
    row.cells.push({
      employeeId: p.employeeId,
      employeeName: employee.name,
      employeeRole: employee.role,
      confidence: p.confidence,
      confirmed: p.confirmed,
      note,
    });
    availabilityRowsByKey.set(key, row);
  }
  const availabilityRows = Array.from(availabilityRowsByKey.values()).sort(
    (a, b) => a.day - b.day || a.shiftType.localeCompare(b.shiftType),
  );
  for (const row of availabilityRows) {
    row.cells.sort((a, b) => a.employeeName.localeCompare(b.employeeName, "he"));
  }

  // All slots expanded
  const totalSlots = headcounts.reduce((sum, h) => {
    if (!isShiftAllowedOnDay(h.shiftType as ShiftType, h.day as DayOfWeek)) return sum;
    return sum + h.headcount;
  }, 0);

  const assignmentRows = assignments.map((a) => ({
    day: a.day,
    shiftType: a.shiftType,
    slotIndex: a.slotIndex,
    employeeId: a.employeeId,
    employeeName: a.employee?.name ?? null,
    employeeNote: a.employeeId
      ? availabilityNoteMap.get(`${a.employeeId}:${a.day}:${a.shiftType}`) ?? null
      : null,
    locked: a.locked,
    generatedScore: a.generatedScore,
    generatedBreakdown: a.generatedBreakdown,
  }));

  const filledSlots = assignmentRows.filter((a) => a.employeeId).length;
  const lockedSlots = assignmentRows.filter((a) => a.locked).length;
  const emptySlots = totalSlots - filledSlots;
  const hasAssignments = assignmentRows.length > 0;

  // Per-employee stats
  const empStats = new Map<
    string,
    {
      total: number;
      closings: number;
      weekends: number;
      mornings: number;
      evenings: number;
    }
  >();
  for (const a of assignmentRows) {
    if (!a.employeeId) continue;
    const stats = empStats.get(a.employeeId) ?? {
      total: 0,
      closings: 0,
      weekends: 0,
      mornings: 0,
      evenings: 0,
    };
    stats.total += 1;
    const def = SHIFT_DEFS[a.shiftType as ShiftType];
    if (def?.isClosing) stats.closings += 1;
    // Weekend = Friday (5) or Saturday (6). Must match the print page and the
    // Excel export, which both count Fri+Sat (previously this counted Friday
    // only, so the editor "סופ״ש" column disagreed with the exports).
    if (a.day === 5 || a.day === 6) stats.weekends += 1;
    if (def?.start && def.start < "12:00") stats.mornings += 1;
    else stats.evenings += 1;
    empStats.set(a.employeeId, stats);
  }

  // Get requestedShifts per employee from their latest submission
  const subs = await prisma.rawSubmission.findMany({
    where: { weekId, employeeId: { not: null } },
    orderBy: { submittedAt: "desc" },
  });
  const requestedByEmp = new Map<string, number>();
  for (const s of subs) {
    if (!s.employeeId) continue;
    if (requestedByEmp.has(s.employeeId)) continue;
    if (s.requestedShifts != null) requestedByEmp.set(s.employeeId, s.requestedShifts);
  }

  // Find empty slot list with locations
  const emptyList: Array<{ day: number; shiftType: string; slotIndex: number }> = [];
  for (const h of headcounts) {
    if (!isShiftAllowedOnDay(h.shiftType as ShiftType, h.day as DayOfWeek)) continue;
    for (let i = 0; i < h.headcount; i++) {
      const a = assignmentRows.find(
        (x) =>
          x.day === h.day && x.shiftType === h.shiftType && x.slotIndex === i,
      );
      if (!a || !a.employeeId) {
        emptyList.push({ day: h.day, shiftType: h.shiftType, slotIndex: i });
      }
    }
  }

  const isApproved = week.status === "approved";

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link
            href="/schedule"
            className="text-sm text-slate-500 hover:text-slate-700"
          >
            ← סידור
          </Link>
          <h2 className="mt-1 flex items-center gap-2 text-2xl font-extrabold text-slate-900">
            סידור שבועי
            {isApproved ? (
              <Badge tone="success">מאושר</Badge>
            ) : (
              <Badge tone="warning">טיוטה</Badge>
            )}
          </h2>
          <p className="text-sm text-slate-500 num">
            {formatWeekRange(week.weekStart)}
          </p>
        </div>
        {hasAssignments && (
          <Link href={`/schedule/${weekId}/print`}>
            <Button variant="secondary">📄 תצוגת הדפסה / ייצוא</Button>
          </Link>
        )}
      </div>

      <WeekPicker weekStart={week.weekStart} basePath="/schedule" />

      <Card>
        <CardBody className="space-y-3">
          <ScheduleControls
            weekId={weekId}
            weekStatus={week.status}
            hasAssignments={hasAssignments}
          />
          {hasAssignments && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <MiniStat label="סה״כ משבצות" value={totalSlots} />
              <MiniStat
                label="מאויש"
                value={`${filledSlots}/${totalSlots}`}
                tone="success"
              />
              <MiniStat
                label="ריק"
                value={emptySlots}
                tone={emptySlots > 0 ? "danger" : "success"}
              />
              <MiniStat label="נעול ידנית" value={lockedSlots} />
            </div>
          )}
        </CardBody>
      </Card>

      {hasAssignments && <ScheduleExportRow weekId={weekId} />}

      {parsed.length === 0 && (
        <Card className="border-amber-200 bg-amber-50/40">
          <CardBody className="text-sm text-amber-900">
            אין נתוני זמינות מאושרים לשבוע זה.{" "}
            <Link
              href={`/availability?week=${encodeURIComponent(formatWeekParam(week.weekStart))}`}
              className="font-medium underline"
            >
              קלוט זמינות
            </Link>{" "}
            לפני יצירת סידור.
          </CardBody>
        </Card>
      )}

      {emptyList.length > 0 && hasAssignments && (
        <Card className="border-rose-200 bg-rose-50/40">
          <CardHeader>
            <CardTitle className="text-rose-900">
              משבצות ריקות ({emptyList.length})
            </CardTitle>
          </CardHeader>
          <CardBody>
            <ul className="grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
              {emptyList.map((e, i) => {
                const def = SHIFT_DEFS[e.shiftType as ShiftType];
                return (
                  <li
                    key={i}
                    className="flex items-center justify-between rounded-md bg-white px-2 py-1.5"
                  >
                    <span className="text-slate-700">
                      <span className="font-medium">
                        {DAY_NAMES_HE[e.day as DayOfWeek]}
                      </span>{" "}
                      · {def?.labelHe}
                    </span>
                    <span className="num text-slate-400">#{e.slotIndex + 1}</span>
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>
      )}

      {hasAssignments && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_260px]">
          <div className="min-w-0 space-y-5">
            {availabilityRows.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-base font-semibold text-slate-900">
                  זמינות כללית להשוואה
                </h3>
                <AvailabilitySummaryGrid
                  rows={availabilityRows}
                  headcounts={headMap}
                />
              </section>
            )}

            <ScheduleGrid
              weekId={weekId}
              assignments={assignmentRows}
              headcounts={headcounts}
              notes={scheduleNotes.map((n) => ({
                day: n.day,
                kind: n.kind,
                content: n.content,
              }))}
              readOnly={isApproved}
            />
          </div>

          <MotivationPanel
            emptySlots={emptySlots}
            filledSlots={filledSlots}
            totalSlots={totalSlots}
          />
        </div>
      )}

      {hasAssignments && empStats.size > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>סיכום לפי עובד</CardTitle>
          </CardHeader>
          <CardBody className="overflow-x-auto p-0">
            {/* RTL: first <th> renders rightmost; last <th> renders leftmost. */}
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-navy text-xs font-semibold text-white">
                  <th className="border border-slate-200 px-3 py-2 text-center">
                    עובד
                  </th>
                  <th className="border border-slate-200 px-3 py-2 text-center">
                    מבוקש
                  </th>
                  <th className="border border-slate-200 px-3 py-2 text-center">
                    שובץ
                  </th>
                  <th className="border border-slate-200 px-3 py-2 text-center">
                    בוקר
                  </th>
                  <th className="border border-slate-200 px-3 py-2 text-center">
                    ערב
                  </th>
                  <th className="border border-slate-200 px-3 py-2 text-center">
                    סגירות
                  </th>
                  <th className="border border-slate-200 px-3 py-2 text-center">
                    סופ״ש
                  </th>
                  <th className="border border-slate-200 px-3 py-2 text-center">
                    הערות
                  </th>
                </tr>
              </thead>
              <tbody>
                {employees
                  .filter((e) => empStats.has(e.id))
                  .sort((a, b) => a.name.localeCompare(b.name, "he"))
                  .map((e) => {
                    const s = empStats.get(e.id)!;
                    const req = requestedByEmp.get(e.id);
                    const notes: string[] = [];
                    if (req != null && s.total < req) notes.push(`חסר ${req - s.total}`);
                    if (req != null && s.total > req) notes.push(`עודף ${s.total - req}`);
                    if (e.noClosings && s.closings > 0)
                      notes.push("שובץ לסגירה למרות העדפה");
                    return (
                      <tr key={e.id} className="hover:bg-brand-50/40">
                        <td className="border border-slate-200 px-3 py-2 text-center font-medium text-slate-900">
                          {e.name}
                        </td>
                        <td
                          className={cn(
                            "border border-slate-200 px-3 py-2 text-center num",
                            req != null && s.total === req && "text-emerald-600",
                            req != null && s.total < req && "text-amber-600",
                            req != null && s.total > req && "text-rose-600",
                          )}
                        >
                          {req != null ? req : "—"}
                        </td>
                        <td className="border border-slate-200 px-3 py-2 text-center font-semibold num">
                          {s.total}
                        </td>
                        <td className="border border-slate-200 px-3 py-2 text-center num">
                          {s.mornings || "—"}
                        </td>
                        <td className="border border-slate-200 px-3 py-2 text-center num">
                          {s.evenings || "—"}
                        </td>
                        <td className="border border-slate-200 px-3 py-2 text-center num">
                          {s.closings || "—"}
                        </td>
                        <td className="border border-slate-200 px-3 py-2 text-center num">
                          {s.weekends || "—"}
                        </td>
                        <td className="border border-slate-200 px-3 py-2 text-start text-xs text-slate-500">
                          {notes.length > 0 ? notes.join(" · ") : "—"}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}

      {lastGen && hasAssignments && (
        <div className="text-center text-xs text-slate-400">
          נוצר לאחרונה:{" "}
          {new Intl.DateTimeFormat("he-IL", {
            day: "numeric",
            month: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }).format(lastGen.createdAt)}
        </div>
      )}
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: "success" | "danger";
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-center shadow-sm">
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 text-xl font-extrabold num",
          tone === "danger" && "text-rose-600",
          tone === "success" && "text-brand-600",
          !tone && "text-slate-900",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function MotivationPanel({
  emptySlots,
  filledSlots,
  totalSlots,
}: {
  emptySlots: number;
  filledSlots: number;
  totalSlots: number;
}) {
  return (
    <aside
      className="h-fit rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-sm"
      dir="ltr"
    >
      <div className="space-y-3">
        <p className="text-sm font-bold text-slate-900">
          Great schedules make great shifts ✨
        </p>
        <p className="text-xs leading-5 text-slate-500">
          You're doing amazing. Almost there, keep going!
        </p>
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
          <div className="text-[10px] font-bold uppercase text-slate-400">
            Coverage
          </div>
          <div className="mt-1 text-xl font-extrabold text-slate-900 num">
            {filledSlots}/{totalSlots}
          </div>
          <div
            className={cn(
              "mt-1 text-xs",
              emptySlots === 0 ? "text-brand-600" : "text-rose-600",
            )}
          >
            {emptySlots === 0
              ? "Every required shift is covered."
              : `${emptySlots} slots left to solve.`}
          </div>
        </div>
      </div>
    </aside>
  );
}
