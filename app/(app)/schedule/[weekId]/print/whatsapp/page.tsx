import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatWeekRange } from "@/lib/week";
import { SHIFT_DEFS, ShiftType, ALL_SHIFT_TYPES } from "@/lib/shifts";
import { DAYS, DAY_NAMES_HE_SHORT, DayOfWeek } from "@/lib/days";
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
    include: { restaurant: true },
  });
  if (!week) notFound();

  const [employees, assignments] = await Promise.all([
    prisma.employee.findMany({
      where: { restaurantId, archived: false },
      orderBy: { name: "asc" },
    }),
    prisma.scheduleAssignment.findMany({
      where: { weekId, employeeId: { not: null } },
      include: { employee: { select: { name: true, role: true } } },
    }),
  ]);

  // Build lookup: shiftType → day → sorted names
  type CellEntry = { name: string; role: string };
  const grid = new Map<string, Map<number, CellEntry[]>>();
  for (const st of ALL_SHIFT_TYPES) grid.set(st, new Map());

  for (const a of assignments) {
    if (!a.employeeId || !a.employee) continue;
    const dayMap = grid.get(a.shiftType);
    if (!dayMap) continue;
    const list = dayMap.get(a.day) ?? [];
    list.push({ name: a.employee.name, role: a.employee.role });
    dayMap.set(a.day, list);
  }

  // Keep only shift types that have at least one assignment in this week
  const activeShiftTypes = ALL_SHIFT_TYPES.filter((st) =>
    DAYS.some((d) => (grid.get(st)?.get(d)?.length ?? 0) > 0),
  );

  const employeeCount = employees.length;
  const assignedCount = new Set(assignments.map((a) => a.employeeId)).size;

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

      {/* Schedule area — this is captured */}
      <div
        id="wa-schedule"
        className="bg-white p-8"
        style={{ fontFamily: "'Arial', 'Helvetica', sans-serif" }}
      >
        {/* Header */}
        <div className="mb-6 border-b-4 border-gray-900 pb-4">
          <h1 className="text-4xl font-black text-gray-900 leading-tight">
            {week.restaurant.name}
          </h1>
          <p className="mt-1 text-2xl font-bold text-gray-600 num">
            {formatWeekRange(week.weekStart)}
          </p>
          <div className="mt-2 flex items-center gap-3 text-base font-semibold text-gray-500">
            <span>{assignedCount} עובדים משובצים</span>
            {week.status === "approved" && (
              <span className="rounded-full bg-emerald-600 px-3 py-0.5 text-sm font-bold text-white">
                ✓ מאושר
              </span>
            )}
          </div>
        </div>

        {/* Schedule grid */}
        {activeShiftTypes.length === 0 ? (
          <p className="py-12 text-center text-2xl font-bold text-gray-400">
            אין שיבוצים לשבוע זה
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table
              className="w-full border-collapse"
              style={{ borderSpacing: 0 }}
            >
              <thead>
                <tr>
                  {/* Shift label column */}
                  <th className="border-2 border-gray-900 bg-gray-900 px-3 py-3 text-right text-base font-black text-white w-32">
                    משמרת
                  </th>
                  {DAYS.map((day) => (
                    <th
                      key={day}
                      className={cn(
                        "border-2 border-gray-900 px-2 py-3 text-center text-2xl font-black",
                        day === 5 || day === 6
                          ? "bg-amber-100 text-amber-900"
                          : "bg-gray-800 text-white",
                      )}
                    >
                      {DAY_NAMES_HE_SHORT[day as DayOfWeek]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeShiftTypes.map((st, rowIdx) => {
                  const def = SHIFT_DEFS[st as ShiftType];
                  if (!def) return null;
                  const isEven = rowIdx % 2 === 0;
                  return (
                    <tr key={st}>
                      <td
                        className={cn(
                          "border-2 border-gray-900 px-3 py-3",
                          isEven ? "bg-gray-100" : "bg-gray-50",
                        )}
                      >
                        <div className="text-sm font-black text-gray-900 leading-tight">
                          {def.labelHe}
                        </div>
                        <div className="text-xs font-bold text-gray-500 num">
                          {def.start}–{def.end}
                        </div>
                      </td>
                      {DAYS.map((day) => {
                        const entries = grid.get(st)?.get(day) ?? [];
                        return (
                          <td
                            key={day}
                            className={cn(
                              "border-2 border-gray-900 px-2 py-2 text-center align-top",
                              entries.length === 0
                                ? "bg-gray-50"
                                : def.role === "kitchen"
                                  ? isEven
                                    ? "bg-orange-50"
                                    : "bg-orange-100/60"
                                  : isEven
                                    ? "bg-sky-50"
                                    : "bg-sky-100/60",
                            )}
                          >
                            {entries.length === 0 ? (
                              <span className="text-xl font-bold text-gray-300">—</span>
                            ) : (
                              <div className="space-y-1">
                                {entries.map((e, i) => (
                                  <div
                                    key={i}
                                    className="text-base font-black text-gray-900 leading-tight"
                                  >
                                    {e.name}
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
              </tbody>
            </table>
          </div>
        )}

        {/* Footer */}
        <div className="mt-4 flex items-center justify-between text-sm font-semibold text-gray-400">
          <span>{employeeCount} עובדים</span>
          <span className="num">
            {new Intl.DateTimeFormat("he-IL", {
              day: "numeric",
              month: "numeric",
              year: "numeric",
            }).format(new Date())}
          </span>
        </div>
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
