import { notFound } from "next/navigation";
import { Heebo } from "next/font/google";
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

const heebo = Heebo({
  subsets: ["latin", "hebrew"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata = {
  title: "טופס זמינות",
};

export default async function PublicAvailabilityPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ week?: string }>;
}) {
  const [{ token }, sp] = await Promise.all([params, searchParams]);

  const employee = await prisma.employee.findUnique({
    where: { submissionToken: token },
    include: { restaurant: true },
  });
  if (!employee || employee.archived) notFound();

  const activeWeekStart = defaultActiveWeekStart();
  // Allow 1 week back, 2 weeks forward from the current active week.
  const minWeek = prevSunday(activeWeekStart);
  const maxWeek = nextSunday(nextSunday(activeWeekStart));

  // Clamp the requested week to [min, max]
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

  // Template headcount per (day, shiftType) — used to hide closed combos on the form.
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
    return `/a/${token}?week=${encodeURIComponent(formatWeekParam(d))}`;
  }

  return (
    <main className={`min-h-screen bg-navy ${heebo.className}`}>
      <div className="mx-auto max-w-md px-4 pb-8">
        <div className="pb-5 pt-7 text-white">
          <div className="text-sm font-medium text-brand-300">{employee.restaurant.name}</div>
          <h1 className="mt-2 text-2xl font-extrabold">שלום {employee.name} 👋</h1>
          <p className="mt-2 text-sm text-white/70">
            הגישו זמינות לשבוע{" "}
            <span className="num font-medium text-white/90">
              {formatWeekRange(weekStart)}
            </span>
          </p>
        </div>

        <div className="rounded-t-3xl bg-gray-50 px-4 pb-6 pt-5">
        {/* Week navigation */}
        <div className="mb-3 flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-2.5 shadow-sm">
          {hasPrev ? (
            <a
              href={weekUrl(prevWeek)}
              className="text-sm text-brand-600 hover:underline"
            >
              ← שבוע קודם
            </a>
          ) : (
            <span className="text-sm text-slate-300">← שבוע קודם</span>
          )}
          <span className="num text-xs text-slate-500">
            {formatWeekRange(weekStart)}
          </span>
          {hasNext ? (
            <a
              href={weekUrl(nextWeek)}
              className="text-sm text-brand-600 hover:underline"
            >
              שבוע הבא →
            </a>
          ) : (
            <span className="text-sm text-slate-300">שבוע הבא →</span>
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
            <div className="mb-3 flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-xs text-slate-600 shadow-sm">
              תפקיד שלך:{" "}
              <span className="font-semibold">
                {employee.role === "kitchen"
                  ? "מטבח"
                  : employee.role === "floor"
                    ? "פלור"
                    : "מטבח + פלור"}
              </span>
              {" "}— תוצגנה רק משמרות הרלוונטיות לך
            </div>

            <EmployeeAvailabilityForm
              token={token}
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

        <p className="mt-6 text-center text-xs text-slate-400">
          בעיה? פנו למנהל/ת המשמרת
        </p>
        </div>
      </div>
    </main>
  );
}
