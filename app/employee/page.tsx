import { redirect } from "next/navigation";
import { getEmployeeSession } from "@/lib/employee-auth";
import { prisma } from "@/lib/db";
import {
  defaultActiveWeekStart,
  formatWeekParam,
  formatWeekRange,
  getOrCreateWeek,
  nextSunday,
  parseWeekStartParam,
  prevSunday,
} from "@/lib/week";
import { EmployeeAvailabilityForm } from "@/components/employee-availability-form";
import { WEEK_NOTE_SHIFT_TYPE } from "@/lib/shifts";
import { EmployeeLogoutButton } from "@/components/employee-logout-button";

export const metadata = {
  title: "טופס זמינות",
};

export default async function EmployeeAvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const employee = await getEmployeeSession();
  if (!employee) redirect("/employee/login");

  const sp = await searchParams;

  const activeWeekStart = defaultActiveWeekStart();
  const minWeek = prevSunday(activeWeekStart);
  const maxWeek = nextSunday(nextSunday(activeWeekStart));

  const requestedWeek = parseWeekStartParam(sp.week);
  const weekStart =
    requestedWeek < minWeek
      ? minWeek
      : requestedWeek > maxWeek
        ? maxWeek
        : requestedWeek;

  const week = await getOrCreateWeek(employee.restaurantId, weekStart);

  const [existing, templates, weekOverrides] = await Promise.all([
    prisma.parsedAvailability.findMany({
      where: { weekId: week.id, employeeId: employee.id },
    }),
    prisma.shiftTemplate.findMany({
      where: { restaurantId: employee.restaurantId },
    }),
    prisma.weekOverride.findMany({ where: { weekId: week.id } }),
  ]);

  const headcountMap = new Map<string, number>();
  for (const t of templates) headcountMap.set(`${t.day}:${t.shiftType}`, t.headcount);
  for (const o of weekOverrides) headcountMap.set(`${o.day}:${o.shiftType}`, o.headcount);
  const headcounts = Array.from(headcountMap.entries()).map(([k, n]) => {
    const [day, shiftType] = k.split(":");
    return { day: parseInt(day, 10), shiftType, headcount: n };
  });

  const weekNoteRow = existing.find((e) => e.shiftType === WEEK_NOTE_SHIFT_TYPE);
  const shiftCells = existing.filter((e) => e.shiftType !== WEEK_NOTE_SHIFT_TYPE);

  const prevWeek = prevSunday(weekStart);
  const nextWeek = nextSunday(weekStart);
  const hasPrev = prevWeek >= minWeek;
  const hasNext = nextWeek <= maxWeek;

  function weekUrl(d: Date) {
    return `/employee?week=${encodeURIComponent(formatWeekParam(d))}`;
  }

  return (
    <main className="min-h-screen bg-warm-50">
      <div className="mx-auto max-w-md px-4 pb-8">
        {/* Warm header */}
        <div className="pb-5 pt-7">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-brand-600">{employee.restaurant.name}</div>
            <EmployeeLogoutButton />
          </div>
          <h1 className="mt-2 text-2xl font-extrabold text-brown-900">שלום {employee.name} 👋</h1>
          <p className="mt-2 text-sm text-brown-500">
            הגישו זמינות לשבוע{" "}
            <span className="num font-medium text-brown-700">
              {formatWeekRange(weekStart)}
            </span>
          </p>
        </div>

        {/* Content area */}
        <div className="rounded-t-3xl bg-cream-50 px-4 pb-6 pt-5">
          <div className="mb-3 flex items-center justify-between rounded-xl border border-cream-200 bg-white px-4 py-2.5 shadow-warm">
            {hasPrev ? (
              <a
                href={weekUrl(prevWeek)}
                className="text-sm font-semibold text-brand-600 hover:underline"
              >
                ← שבוע קודם
              </a>
            ) : (
              <span className="text-sm text-brown-400">← שבוע קודם</span>
            )}
            <span className="num text-xs text-brown-400">
              {formatWeekRange(weekStart)}
            </span>
            {hasNext ? (
              <a
                href={weekUrl(nextWeek)}
                className="text-sm font-semibold text-brand-600 hover:underline"
              >
                שבוע הבא →
              </a>
            ) : (
              <span className="text-sm text-brown-400">שבוע הבא →</span>
            )}
          </div>

          {week.status === "approved" ? (
            <div className="rounded-2xl border border-brand-200 bg-brand-50 p-5 text-center text-brand-800">
              <div className="text-3xl">📌</div>
              <h2 className="mt-2 text-lg font-bold">
                הסידור לשבוע זה כבר אושר
              </h2>
              <p className="mt-2 text-sm leading-relaxed">
                כבר לא ניתן לשלוח עדכון זמינות דרך הטופס.
                <br />
                אם יש שינוי דחוף, פנו ישירות למנהל/ת.
              </p>
              {shiftCells.length > 0 && (
                <p className="mt-3 text-xs text-brand-600">
                  הזמינות שהוגשה: <span className="num">{shiftCells.length}</span> משמרות
                </p>
              )}
            </div>
          ) : (
            <>
              <div className="mb-3 flex items-center gap-2 rounded-xl border border-cream-200 bg-white px-4 py-2.5 text-xs text-brown-600 shadow-warm">
                <span className="text-base">🍽️</span>
                תפקיד שלך:{" "}
                <span className="font-bold">
                  {employee.role === "kitchen"
                    ? "מטבח"
                    : employee.role === "floor"
                      ? "פלור"
                      : "מטבח + פלור"}
                </span>
                {" "}— תוצגנה רק משמרות הרלוונטיות לך
              </div>

              <EmployeeAvailabilityForm
                employeeId={employee.id}
                weekStart={formatWeekParam(weekStart)}
                initialCells={shiftCells.map((e) => ({
                  day: e.day,
                  shiftType: e.shiftType,
                  note: e.note ?? null,
                }))}
                employeeRole={employee.role as "kitchen" | "floor" | "both"}
                headcounts={headcounts}
                initialWeekNote={weekNoteRow?.note ?? ""}
              />
            </>
          )}

          <p className="mt-6 text-center text-xs text-brown-400">
            בעיה? פנו למנהל/ת המשמרת
          </p>
        </div>
      </div>
    </main>
  );
}
