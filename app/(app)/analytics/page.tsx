import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { clearSessionPath } from "@/lib/auth-routes";
import {
  getActiveManagerForSession,
  hasValidSessionUser,
} from "@/lib/session-validation";
import { prisma } from "@/lib/db";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SHIFT_DEFS, ShiftType } from "@/lib/shifts";
import { roleBadge } from "@/lib/role-labels";
import { cn } from "@/lib/utils";
import { formatWeekRange } from "@/lib/week";

export default async function AnalyticsPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (!hasValidSessionUser(session)) redirect(clearSessionPath("/login"));

  const manager = await getActiveManagerForSession(session);
  if (!manager) redirect(clearSessionPath("/login"));
  const restaurantId = manager.restaurantId;

  const [employees, weeks, allAssignments] = await Promise.all([
    prisma.employee.findMany({
      where: { restaurantId, archived: false },
      orderBy: { name: "asc" },
    }),
    prisma.week.findMany({
      where: { restaurantId },
      orderBy: { weekStart: "desc" },
      take: 12,
    }),
    prisma.scheduleAssignment.findMany({
      where: {
        week: { restaurantId },
        employeeId: { not: null },
      },
      include: { week: true },
    }),
  ]);

  // Per-employee aggregation
  type EmployeeStats = {
    name: string;
    role: string;
    total: number;
    mornings: number;
    evenings: number;
    closings: number;
    weekends: number;
    weeks: Set<string>;
  };

  const empStats = new Map<string, EmployeeStats>();
  for (const e of employees) {
    empStats.set(e.id, {
      name: e.name,
      role: e.role,
      total: 0,
      mornings: 0,
      evenings: 0,
      closings: 0,
      weekends: 0,
      weeks: new Set(),
    });
  }

  for (const a of allAssignments) {
    if (!a.employeeId) continue;
    const s = empStats.get(a.employeeId);
    if (!s) continue;
    s.total += 1;
    s.weeks.add(a.weekId);
    const def = SHIFT_DEFS[a.shiftType as ShiftType];
    if (!def) continue;
    if (def.start < "12:00") s.mornings += 1;
    else s.evenings += 1;
    if (def.isClosing) s.closings += 1;
    if (a.day === 5 || a.day === 6) s.weekends += 1;
  }

  const statsList = Array.from(empStats.values())
    .filter((s) => s.total > 0)
    .sort((a, b) => b.total - a.total);

  const mostScheduled = statsList[0];
  const leastScheduled = statsList[statsList.length - 1];

  // Week-over-week totals
  const weekTotals = new Map<string, { weekStart: Date; count: number }>();
  for (const w of weeks) {
    weekTotals.set(w.id, { weekStart: w.weekStart, count: 0 });
  }
  for (const a of allAssignments) {
    const wt = weekTotals.get(a.weekId);
    if (wt) wt.count += 1;
  }
  const weeklyData = Array.from(weekTotals.values())
    .sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime());

  // Totals
  const totalShifts = allAssignments.length;
  const totalMornings = allAssignments.filter((a) => {
    const def = SHIFT_DEFS[a.shiftType as ShiftType];
    return def && def.start < "12:00";
  }).length;
  const totalEvenings = totalShifts - totalMornings;
  const totalClosings = allAssignments.filter((a) => {
    const def = SHIFT_DEFS[a.shiftType as ShiftType];
    return def?.isClosing;
  }).length;

  // Estimate hours
  function shiftHours(shiftType: string): number {
    const def = SHIFT_DEFS[shiftType as ShiftType];
    if (!def) return 0;
    const [sh, sm] = def.start.split(":").map(Number);
    const [eh, em] = def.end.split(":").map(Number);
    let hours = (eh + em / 60) - (sh + sm / 60);
    if (hours < 0) hours += 24;
    return hours;
  }

  const empHours = new Map<string, number>();
  for (const a of allAssignments) {
    if (!a.employeeId) continue;
    empHours.set(
      a.employeeId,
      (empHours.get(a.employeeId) ?? 0) + shiftHours(a.shiftType),
    );
  }

  const maxBarValue = weeklyData.reduce((m, w) => Math.max(m, w.count), 1);

  const totalHours = Array.from(empHours.values()).reduce((s, h) => s + h, 0);

  // Monthly aggregation
  type MonthBucket = { label: string; shifts: number; hours: number };
  const monthMap = new Map<string, MonthBucket>();
  for (const a of allAssignments) {
    const w = weekTotals.get(a.weekId);
    if (!w) continue;
    const key = new Intl.DateTimeFormat("he-IL", { month: "long", year: "numeric" }).format(w.weekStart);
    const b = monthMap.get(key) ?? { label: key, shifts: 0, hours: 0 };
    b.shifts += 1;
    b.hours += shiftHours(a.shiftType);
    monthMap.set(key, b);
  }
  const monthlyData = Array.from(monthMap.values()).slice(-4);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h2 className="text-2xl font-extrabold text-brown-900">📊 אנליטיקס</h2>
        <p className="text-sm text-brown-500">
          נתוני שיבוצים מצטברים · {weeks.length} שבועות אחרונים
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <SummaryCard
          label="סה״כ שיבוצים"
          value={totalShifts}
          icon="📋"
          iconBg="bg-brand-100"
        />
        <SummaryCard
          label="שעות (משוער)"
          value={Math.round(totalHours)}
          sub="כלל העובדים"
          icon="⏱"
          iconBg="bg-teal-50"
        />
        <SummaryCard
          label="משמרות בוקר"
          value={totalMornings}
          sub={totalShifts > 0 ? `${Math.round((totalMornings / totalShifts) * 100)}%` : undefined}
          icon="☀️"
          iconBg="bg-amber-50"
        />
        <SummaryCard
          label="משמרות ערב"
          value={totalEvenings}
          sub={totalShifts > 0 ? `${Math.round((totalEvenings / totalShifts) * 100)}%` : undefined}
          icon="🌙"
          iconBg="bg-violet-50"
        />
        <SummaryCard
          label="סגירות"
          value={totalClosings}
          sub={totalShifts > 0 ? `${Math.round((totalClosings / totalShifts) * 100)}%` : undefined}
          icon="🔒"
          iconBg="bg-rose-50"
        />
      </div>

      {/* Highlights */}
      {mostScheduled && leastScheduled && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Card>
            <CardBody className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-100 text-xl">
                🏆
              </div>
              <div>
                <div className="text-xs font-medium text-brown-500">הכי משובץ</div>
                <div className="text-lg font-bold text-brown-900">{mostScheduled.name}</div>
                <div className="text-xs text-brown-400">
                  {mostScheduled.total} משמרות · {roleBadge(mostScheduled.role)}
                </div>
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardBody className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-warm-100 text-xl">
                📉
              </div>
              <div>
                <div className="text-xs font-medium text-brown-500">הכי פחות משובץ</div>
                <div className="text-lg font-bold text-brown-900">{leastScheduled.name}</div>
                <div className="text-xs text-brown-400">
                  {leastScheduled.total} משמרות · {roleBadge(leastScheduled.role)}
                </div>
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {/* Monthly summary */}
      {monthlyData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>סיכום חודשי</CardTitle>
          </CardHeader>
          <CardBody className="overflow-x-auto p-0">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-brown-800 text-xs font-semibold text-white">
                  <th className="border border-cream-200 px-4 py-2.5 text-start">חודש</th>
                  <th className="border border-cream-200 px-4 py-2.5 text-center">שיבוצים</th>
                  <th className="border border-cream-200 px-4 py-2.5 text-center">שעות (משוער)</th>
                  <th className="border border-cream-200 px-4 py-2.5 text-center">ממוצע לעובד</th>
                </tr>
              </thead>
              <tbody>
                {monthlyData.map((m, i) => (
                  <tr key={i} className="hover:bg-brand-50/30">
                    <td className="border border-cream-200 px-4 py-2 font-medium text-brown-900">
                      {m.label}
                    </td>
                    <td className="border border-cream-200 px-4 py-2 text-center num font-bold">
                      {m.shifts}
                    </td>
                    <td className="border border-cream-200 px-4 py-2 text-center num">
                      {Math.round(m.hours)}
                    </td>
                    <td className="border border-cream-200 px-4 py-2 text-center num text-brown-500">
                      {statsList.length > 0 ? Math.round(m.shifts / statsList.length * 10) / 10 : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}

      {/* Weekly chart */}
      {weeklyData.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>שיבוצים לפי שבוע</CardTitle>
          </CardHeader>
          <CardBody>
            <div className="flex items-end gap-2" style={{ height: 160 }}>
              {weeklyData.map((w, i) => {
                const pct = maxBarValue > 0 ? (w.count / maxBarValue) * 100 : 0;
                return (
                  <div key={i} className="flex flex-1 flex-col items-center gap-1">
                    <span className="text-[10px] font-bold text-brown-600 num">
                      {w.count}
                    </span>
                    <div
                      className="w-full rounded-t-lg bg-gradient-to-t from-brand-500 to-brand-400 transition-all"
                      style={{ height: `${Math.max(pct, 4)}%`, minHeight: 4 }}
                    />
                    <span className="text-[9px] text-brown-400 num">
                      {new Intl.DateTimeFormat("he-IL", {
                        day: "numeric",
                        month: "numeric",
                      }).format(w.weekStart)}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Per-employee table */}
      {statsList.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>פירוט לפי עובד</CardTitle>
          </CardHeader>
          <CardBody className="overflow-x-auto p-0">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-brown-800 text-xs font-semibold text-white">
                  <th className="border border-cream-200 px-3 py-2.5 text-center">#</th>
                  <th className="border border-cream-200 px-3 py-2.5 text-center">עובד</th>
                  <th className="border border-cream-200 px-3 py-2.5 text-center">תפקיד</th>
                  <th className="border border-cream-200 px-3 py-2.5 text-center">סה״כ</th>
                  <th className="border border-cream-200 px-3 py-2.5 text-center">בוקר</th>
                  <th className="border border-cream-200 px-3 py-2.5 text-center">ערב</th>
                  <th className="border border-cream-200 px-3 py-2.5 text-center">סגירות</th>
                  <th className="border border-cream-200 px-3 py-2.5 text-center">סופ״ש</th>
                  <th className="border border-cream-200 px-3 py-2.5 text-center">שעות (משוער)</th>
                  <th className="border border-cream-200 px-3 py-2.5 text-center">שבועות</th>
                  <th className="border border-cream-200 px-3 py-2.5 text-center">חלוקה</th>
                </tr>
              </thead>
              <tbody>
                {statsList.map((s, idx) => {
                  const hours = empHours.get(
                    employees.find((e) => e.name === s.name)?.id ?? "",
                  ) ?? 0;
                  const morningPct = s.total > 0 ? Math.round((s.mornings / s.total) * 100) : 0;
                  const eveningPct = 100 - morningPct;
                  return (
                    <tr key={idx} className="hover:bg-brand-50/30">
                      <td className="border border-cream-200 px-3 py-2 text-center text-xs text-brown-400">
                        {idx + 1}
                      </td>
                      <td className="border border-cream-200 px-3 py-2 text-center font-medium text-brown-900">
                        {s.name}
                      </td>
                      <td className="border border-cream-200 px-3 py-2 text-center text-xs text-brown-500">
                        {roleBadge(s.role)}
                      </td>
                      <td className="border border-cream-200 px-3 py-2 text-center font-bold num">
                        {s.total}
                      </td>
                      <td className="border border-cream-200 px-3 py-2 text-center num">
                        {s.mornings || "—"}
                      </td>
                      <td className="border border-cream-200 px-3 py-2 text-center num">
                        {s.evenings || "—"}
                      </td>
                      <td className="border border-cream-200 px-3 py-2 text-center num">
                        {s.closings || "—"}
                      </td>
                      <td className="border border-cream-200 px-3 py-2 text-center num">
                        {s.weekends || "—"}
                      </td>
                      <td className="border border-cream-200 px-3 py-2 text-center num">
                        {Math.round(hours)}
                      </td>
                      <td className="border border-cream-200 px-3 py-2 text-center num">
                        {s.weeks.size}
                      </td>
                      <td className="border border-cream-200 px-2 py-2">
                        <div className="flex h-4 overflow-hidden rounded-full">
                          <div
                            className="bg-amber-400"
                            style={{ width: `${morningPct}%` }}
                            title={`בוקר ${morningPct}%`}
                          />
                          <div
                            className="bg-violet-400"
                            style={{ width: `${eveningPct}%` }}
                            title={`ערב ${eveningPct}%`}
                          />
                        </div>
                        <div className="mt-0.5 flex justify-between text-[9px] text-brown-400">
                          <span>☀ {morningPct}%</span>
                          <span>{eveningPct}% 🌙</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}

      {statsList.length === 0 && (
        <Card>
          <CardBody className="py-12 text-center text-sm text-brown-500">
            אין נתוני שיבוצים עדיין. צרו סידור שבועי כדי לראות נתונים כאן.
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  icon,
  iconBg,
}: {
  label: string;
  value: number;
  sub?: string;
  icon: string;
  iconBg: string;
}) {
  return (
    <Card>
      <CardBody>
        <div className={cn("mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl text-lg", iconBg)}>
          {icon}
        </div>
        <div className="text-xs font-medium text-brown-500">{label}</div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-3xl font-extrabold text-brown-900 num">{value}</span>
          {sub && <span className="text-sm text-brown-400 num">{sub}</span>}
        </div>
      </CardBody>
    </Card>
  );
}
