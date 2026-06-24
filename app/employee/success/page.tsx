import Link from "next/link";
import { redirect } from "next/navigation";
import { getEmployeeSession } from "@/lib/employee-auth";
import { prisma } from "@/lib/db";
import {
  defaultActiveWeekStart,
  formatWeekRange,
  getOrCreateWeek,
} from "@/lib/week";
import { DAYS, DAY_NAMES_HE, DayOfWeek } from "@/lib/days";
import { ALL_SHIFT_TYPES, SHIFT_DEFS, WEEK_NOTE_SHIFT_TYPE } from "@/lib/shifts";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "הזמינות נקלטה",
};

export default async function EmployeeSuccessPage() {
  const employee = await getEmployeeSession();
  if (!employee) redirect("/employee/login");

  const weekStart = defaultActiveWeekStart();
  const week = await getOrCreateWeek(employee.restaurantId, weekStart);

  const allParsed = await prisma.parsedAvailability.findMany({
    where: { weekId: week.id, employeeId: employee.id },
    orderBy: [{ day: "asc" }, { shiftType: "asc" }],
  });
  const weekNoteRow = allParsed.find((p) => p.shiftType === WEEK_NOTE_SHIFT_TYPE);
  const parsed = allParsed.filter((p) => p.shiftType !== WEEK_NOTE_SHIFT_TYPE);

  const byDay = new Map<DayOfWeek, typeof parsed>();
  for (const p of parsed) {
    const day = p.day as DayOfWeek;
    const arr = byDay.get(day) ?? [];
    arr.push(p);
    byDay.set(day, arr);
  }

  const totalCells = parsed.length;

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-md p-4">
        <div className="rounded-2xl bg-gradient-to-br from-brand-500 to-brand-600 p-6 text-white shadow-lg shadow-brand-500/20">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-white/20 text-2xl">
              ✓
            </span>
            <div>
              <h1 className="text-xl font-bold">הזמינות נקלטה בהצלחה</h1>
              <p className="mt-0.5 text-sm opacity-90">תודה {employee.name}!</p>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="text-xs font-medium text-slate-500">
            סיכום הזמינות שנשלחה
          </div>
          <div className="mt-1 text-sm font-semibold text-slate-900">
            {employee.restaurant.name} ·{" "}
            <span className="num">{formatWeekRange(weekStart)}</span>
          </div>
          <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-sm font-medium text-brand-700">
            <span className="num">{totalCells}</span>
            <span>משמרות סומנו</span>
          </div>
        </div>

        {totalCells === 0 ? (
          <div className="mt-4 rounded-2xl bg-white p-6 text-center text-sm text-slate-500 ring-1 ring-slate-200">
            לא סומנו משמרות. אם זו טעות, חזרו ועדכנו.
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {DAYS.map((d) => {
              const cells = byDay.get(d as DayOfWeek) ?? [];
              if (cells.length === 0) return null;
              return (
                <div
                  key={d}
                  className="rounded-2xl bg-white p-3 ring-1 ring-slate-200"
                >
                  <div className="mb-2 text-sm font-semibold text-slate-900">
                    {DAY_NAMES_HE[d as DayOfWeek]}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {ALL_SHIFT_TYPES.filter((st) =>
                      cells.some((c) => c.shiftType === st),
                    ).map((st) => {
                      const def = SHIFT_DEFS[st];
                      return (
                        <span
                          key={st}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                            def.role === "kitchen"
                              ? "bg-kitchen-50 text-kitchen-500"
                              : "bg-floor-50 text-floor-500",
                          )}
                        >
                          {def.labelHe}
                          <span className="num text-[10px] opacity-70">
                            {def.start}-{def.end}
                          </span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {weekNoteRow?.note && (
          <div className="mt-3 rounded-2xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
            <div className="mb-1 text-xs font-medium text-amber-700">
              הערה כללית לשבוע
            </div>
            <div className="whitespace-pre-wrap">{weekNoteRow.note}</div>
          </div>
        )}

        <div className="mt-6 flex flex-col gap-2">
          <Link
            href="/employee"
            className="inline-flex items-center justify-center rounded-xl bg-white px-4 py-3 text-sm font-medium text-brand-700 ring-1 ring-brand-200 transition-colors hover:bg-brand-50"
          >
            עדכון הזמינות
          </Link>
          <p className="text-center text-xs text-slate-400">
            ניתן לשלוח שוב כל עוד הסידור לא אושר
          </p>
        </div>
      </div>
    </main>
  );
}
