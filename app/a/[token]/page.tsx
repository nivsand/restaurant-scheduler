import { notFound } from "next/navigation";
import { Heebo } from "next/font/google";
import { prisma } from "@/lib/db";
import {
  defaultActiveWeekStart,
  formatWeekParam,
  formatWeekRange,
  getOrCreateWeek,
} from "@/lib/week";
import { EmployeeAvailabilityForm } from "@/components/employee-availability-form";

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
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const employee = await prisma.employee.findUnique({
    where: { submissionToken: token },
    include: { restaurant: true },
  });
  if (!employee || employee.archived) notFound();

  const weekStart = defaultActiveWeekStart();
  const week = await getOrCreateWeek(employee.restaurantId, weekStart);

  const [existing, latestSubmission, templates, weekOverrides] = await Promise.all([
    prisma.parsedAvailability.findMany({
      where: { weekId: week.id, employeeId: employee.id },
    }),
    prisma.rawSubmission.findFirst({
      where: { weekId: week.id, employeeId: employee.id, source: "form" },
      orderBy: { submittedAt: "desc" },
    }),
    prisma.shiftTemplate.findMany({
      where: { restaurantId: employee.restaurantId },
    }),
    prisma.weekOverride.findMany({ where: { weekId: week.id } }),
  ]);
  const submittedNote =
    latestSubmission?.content.match(/הערה:\s*([\s\S]+)$/)?.[1]?.trim() ?? "";

  // Template headcount per (day, shiftType) — used to hide closed combos on the form.
  const headcountMap = new Map<string, number>();
  for (const t of templates) headcountMap.set(`${t.day}:${t.shiftType}`, t.headcount);
  for (const o of weekOverrides) headcountMap.set(`${o.day}:${o.shiftType}`, o.headcount);
  const headcounts = Array.from(headcountMap.entries()).map(([k, n]) => {
    const [day, shiftType] = k.split(":");
    return { day: parseInt(day, 10), shiftType, headcount: n };
  });

  return (
    <main className={`min-h-screen bg-slate-50 ${heebo.className}`}>
      <div className="mx-auto max-w-md p-4">
        <div className="mb-4 rounded-2xl bg-gradient-to-br from-brand-600 to-brand-700 p-5 text-white shadow-lg">
          <div className="text-sm opacity-80">{employee.restaurant.name}</div>
          <h1 className="mt-1 text-2xl font-bold">שלום {employee.name} 👋</h1>
          <p className="mt-2 text-sm opacity-90">
            הגישו זמינות לשבוע{" "}
            <span className="num font-medium">
              {formatWeekRange(weekStart)}
            </span>
          </p>
        </div>

        {week.status === "approved" ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center text-emerald-900">
            <div className="text-3xl">📌</div>
            <h2 className="mt-2 text-lg font-bold">
              הסידור לשבוע זה כבר אושר
            </h2>
            <p className="mt-2 text-sm leading-relaxed">
              כבר לא ניתן לשלוח עדכון זמינות דרך הטופס.
              <br />
              אם יש שינוי דחוף, פנו ישירות למנהל/ת.
            </p>
            {existing.length > 0 && (
              <p className="mt-3 text-xs text-emerald-700">
                הזמינות שהוגשה: <span className="num">{existing.length}</span> משמרות
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="mb-3 rounded-xl bg-white px-3 py-2 text-xs text-slate-600 ring-1 ring-slate-200">
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
              initialCells={existing.map((e) => ({
                day: e.day,
                shiftType: e.shiftType,
              }))}
              initialNote={submittedNote}
              employeeRole={employee.role as "kitchen" | "floor" | "both"}
              headcounts={headcounts}
            />
          </>
        )}

        <p className="mt-6 text-center text-xs text-slate-400">
          בעיה? פנו למנהל/ת המשמרת
        </p>
      </div>
    </main>
  );
}
