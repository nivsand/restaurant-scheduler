import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatWeekRange } from "@/lib/week";
import { ALL_SHIFT_TYPES, ShiftType } from "@/lib/shifts";
import { loadShiftDefs } from "@/lib/shift-hours";
import { DAYS, DAY_NAMES_HE_SHORT, DayOfWeek } from "@/lib/days";
import { themeForShift, NOTE_THEME, NOTE_LABELS_HE } from "@/lib/grid-theme";
import { NOTE_KINDS } from "@/components/schedule-grid";
import { cn } from "@/lib/utils";
import { WaProfilePrintControls } from "@/components/wa-profile-print-controls";

export const metadata = { title: "ייצוא פרופיל WhatsApp" };

export default async function WhatsappProfilePage({
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
    include: { restaurant: true, overrides: true },
  });
  if (!week) notFound();

  const [templates, assignments, scheduleNotes, shiftDefs] = await Promise.all([
    prisma.shiftTemplate.findMany({ where: { restaurantId } }),
    prisma.scheduleAssignment.findMany({
      where: { weekId, employeeId: { not: null } },
      include: { employee: { select: { name: true } } },
    }),
    prisma.scheduleNote.findMany({ where: { weekId } }),
    loadShiftDefs(restaurantId),
  ]);

  // Effective headcount per (day, shiftType) — template default, overridden per-week.
  const headMap = new Map<string, number>();
  for (const t of templates) headMap.set(`${t.day}:${t.shiftType}`, t.headcount);
  for (const o of week.overrides) {
    if (o.headcount > 0) headMap.set(`${o.day}:${o.shiftType}`, o.headcount);
  }

  // Assigned employee names per (day, shiftType), ordered by slot.
  const assignMap = new Map<string, string[]>();
  for (const a of [...assignments].sort((x, y) => x.slotIndex - y.slotIndex)) {
    if (!a.employee) continue;
    const key = `${a.day}:${a.shiftType}`;
    const list = assignMap.get(key) ?? [];
    list.push(a.employee.name);
    assignMap.set(key, list);
  }

  const noteMap = new Map<string, string>();
  for (const n of scheduleNotes) {
    if (!n.content.trim()) continue;
    noteMap.set(`${n.day}:${n.kind}`, n.content);
  }

  // Only rows with real content this week — same rule the editor uses.
  const activeShiftTypes = ALL_SHIFT_TYPES.filter((st) =>
    DAYS.some((d) => (headMap.get(`${d}:${st}`) ?? 0) > 0),
  );
  const activeNoteKinds = NOTE_KINDS.filter((kind) =>
    DAYS.some((d) => noteMap.has(`${d}:${kind}`)),
  );

  const hasContent = activeShiftTypes.length > 0 || activeNoteKinds.length > 0;

  return (
    <main className="min-h-screen bg-white" dir="rtl">
      {/* Toolbar — hidden in export */}
      <div
        className="flex items-center justify-between border-b border-cream-200 bg-cream-50 px-4 py-3 print:hidden"
        data-no-export="true"
      >
        <Link
          href={`/schedule/${weekId}/print`}
          className="text-sm text-brown-500 hover:text-brown-700"
        >
          ← חזרה לייצוא רגיל
        </Link>
        <WaProfilePrintControls weekId={weekId} />
      </div>

      {/* Schedule area — this is captured. No hardcoded height: grows with content. */}
      <div id="wa-schedule" className="bg-white p-8">
        {/* Header — restaurant name + week range only */}
        <div className="mb-6 border-b-4 border-brown-400 pb-3">
          <h1 className="text-4xl font-black text-brown-900 leading-tight">
            {week.restaurant.name}
          </h1>
          <p className="mt-1 text-xl font-bold text-brown-600 num">
            {formatWeekRange(week.weekStart)}
          </p>
        </div>

        {/* Schedule grid */}
        {!hasContent ? (
          <p className="py-12 text-center text-2xl font-bold text-brown-400">
            אין שיבוצים לשבוע זה
          </p>
        ) : (
          <table className="w-full border-collapse" style={{ borderSpacing: 0 }}>
            <thead>
              <tr>
                <th className="w-28 border-2 border-brown-400 bg-cream-100 px-3 py-4 text-center text-lg font-black text-brown-700">
                  משמרת
                </th>
                {DAYS.map((day) => (
                  <th
                    key={day}
                    className={cn(
                      "border-2 border-brown-400 px-2 py-4 text-center text-2xl font-black",
                      day === 5 || day === 6
                        ? "bg-brand-100 text-brand-800"
                        : "bg-cream-100 text-brown-700",
                    )}
                  >
                    {DAY_NAMES_HE_SHORT[day as DayOfWeek]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activeShiftTypes.map((st) => {
                const def = shiftDefs[st as ShiftType];
                if (!def) return null;
                const theme = themeForShift(st as ShiftType);
                return (
                  <tr key={st}>
                    <td
                      className={cn(
                        "border-2 border-brown-400 px-3 py-4 text-center",
                        theme.labelClass,
                      )}
                    >
                      <div className="text-lg font-black leading-tight">
                        {def.labelHe}
                      </div>
                      <div className="text-sm font-bold opacity-80 num">
                        {def.start}–{def.end}
                      </div>
                    </td>
                    {DAYS.map((day) => {
                      const headCount = headMap.get(`${day}:${st}`) ?? 0;
                      if (headCount === 0) {
                        return (
                          <td
                            key={day}
                            className={cn(
                              "border-2 border-brown-400 px-2 py-4 text-center text-base font-bold",
                              theme.closedClass,
                            )}
                          >
                            סגור
                          </td>
                        );
                      }
                      const names = assignMap.get(`${day}:${st}`) ?? [];
                      return (
                        <td
                          key={day}
                          className={cn(
                            "border-2 border-brown-400 px-2 py-3 text-center align-middle",
                            theme.cellClass,
                          )}
                        >
                          {names.length === 0 ? (
                            <span className="text-xl font-bold text-brown-400">—</span>
                          ) : (
                            <div className="space-y-1">
                              {names.map((name, i) => (
                                <div
                                  key={i}
                                  className="text-xl font-black text-brown-900 leading-tight"
                                >
                                  {name}
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}

              {activeNoteKinds.map((kind) => {
                const theme = NOTE_THEME[kind];
                return (
                  <tr key={kind}>
                    <td
                      className={cn(
                        "border-2 border-brown-400 px-3 py-4 text-center",
                        theme.labelClass,
                      )}
                    >
                      <div className="text-lg font-black leading-tight">
                        {NOTE_LABELS_HE[kind]}
                      </div>
                    </td>
                    {DAYS.map((day) => {
                      const content = noteMap.get(`${day}:${kind}`) ?? "";
                      return (
                        <td
                          key={day}
                          className={cn(
                            "border-2 border-brown-400 px-2 py-3 text-center align-middle",
                            theme.cellClass,
                          )}
                        >
                          {content ? (
                            <span className="text-base font-bold leading-snug text-brown-900">
                              {content}
                            </span>
                          ) : (
                            <span className="text-xl font-bold text-brown-400">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Instructions below capture area */}
      <div className="mx-auto max-w-lg px-4 py-6 print:hidden" data-no-export="true">
        <div className="rounded-xl border border-cream-200 bg-cream-50 p-4 text-sm text-brown-600">
          <p className="font-semibold">הוראות שימוש:</p>
          <ol className="mt-2 list-decimal list-inside space-y-1 text-xs">
            <li>לחץ על &quot;שמור תמונה לפרופיל WhatsApp&quot; למעלה</li>
            <li>הקובץ יורד אוטומטית כתמונה מרובעת ברזולוציה גבוהה</li>
            <li>פתח את WhatsApp → הקבוצה → ערוך תמונת פרופיל → בחר את הקובץ</li>
          </ol>
        </div>
      </div>
    </main>
  );
}
