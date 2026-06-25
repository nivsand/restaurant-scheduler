import Link from "next/link";
import { auth } from "@/lib/auth";
import { clearSessionPath } from "@/lib/auth-routes";
import {
  getActiveManagerForSession,
  hasValidSessionUser,
} from "@/lib/session-validation";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { sundayOf } from "@/lib/week";
import { SHIFT_DEFS, ShiftType, ALL_SHIFT_TYPES } from "@/lib/shifts";
import { DAY_NAMES_HE, DayOfWeek } from "@/lib/days";
import { roleBadge } from "@/lib/role-labels";
import { cn } from "@/lib/utils";

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (!hasValidSessionUser(session)) redirect(clearSessionPath("/login"));

  const currentManager = await getActiveManagerForSession(session);
  if (!currentManager) redirect(clearSessionPath("/login"));

  const restaurantId = currentManager.restaurantId;

  const now = new Date();
  const todayWeekStart = sundayOf(now);
  const todayParts = new Intl.DateTimeFormat("en-US", {
    timeZone: process.env.APP_TIME_ZONE ?? "Asia/Jerusalem",
    weekday: "short",
  }).formatToParts(now);
  const dowMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const todayDow = dowMap[todayParts.find((p) => p.type === "weekday")!.value] ?? 0;

  const [restaurant, employeeCount, templateCount, latestWeek, anyAvailability, anySchedule, employees, todayWeek, recentLogs] =
    await Promise.all([
      prisma.restaurant.findUnique({ where: { id: restaurantId } }),
      prisma.employee.count({ where: { restaurantId, archived: false } }),
      prisma.shiftTemplate.count({
        where: { restaurantId, headcount: { gt: 0 } },
      }),
      prisma.week.findFirst({
        where: { restaurantId },
        orderBy: { weekStart: "desc" },
      }),
      prisma.parsedAvailability.findFirst({
        where: { week: { restaurantId } },
      }),
      prisma.scheduleAssignment.findFirst({
        where: { week: { restaurantId }, employeeId: { not: null } },
      }),
      prisma.employee.findMany({
        where: { restaurantId, archived: false },
        orderBy: { name: "asc" },
      }),
      prisma.week.findFirst({
        where: { restaurantId, weekStart: todayWeekStart },
        include: { overrides: true },
      }),
      prisma.auditLog.findMany({
        where: {
          OR: [
            { week: { restaurantId } },
            { manager: { restaurantId } },
          ],
        },
        include: { manager: true, week: true },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ]);

  if (!restaurant) redirect(clearSessionPath("/login"));

  // Today's shifts
  let todayAssignments: Array<{
    shiftType: string;
    employeeName: string;
    employeeRole: string;
    slotIndex: number;
  }> = [];
  let todayEmpty: Array<{ shiftType: string; slotIndex: number }> = [];

  if (todayWeek) {
    const [assignments, templates] = await Promise.all([
      prisma.scheduleAssignment.findMany({
        where: { weekId: todayWeek.id, day: todayDow },
        include: { employee: true },
        orderBy: [{ shiftType: "asc" }, { slotIndex: "asc" }],
      }),
      prisma.shiftTemplate.findMany({ where: { restaurantId } }),
    ]);

    const headMap = new Map<string, number>();
    for (const t of templates) headMap.set(`${t.day}:${t.shiftType}`, t.headcount);
    for (const o of todayWeek.overrides) headMap.set(`${o.day}:${o.shiftType}`, o.headcount);

    todayAssignments = assignments
      .filter((a) => a.employeeId)
      .map((a) => ({
        shiftType: a.shiftType,
        employeeName: a.employee?.name ?? "—",
        employeeRole: a.employee?.role ?? "both",
        slotIndex: a.slotIndex,
      }));

    const assignedSet = new Set(
      assignments.filter((a) => a.employeeId).map((a) => `${a.shiftType}:${a.slotIndex}`),
    );

    for (const [key, count] of headMap.entries()) {
      const [day, shiftType] = key.split(":");
      if (Number(day) !== todayDow) continue;
      if (count === 0) continue;
      for (let i = 0; i < count; i++) {
        if (!assignedSet.has(`${shiftType}:${i}`)) {
          todayEmpty.push({ shiftType, slotIndex: i });
        }
      }
    }
  }

  // Availability status for current active week
  const activeWeek = latestWeek;
  let availabilitySubmitted = 0;
  let availabilityTotal = employeeCount;
  if (activeWeek) {
    const submittedEmployees = await prisma.parsedAvailability.findMany({
      where: { weekId: activeWeek.id },
      select: { employeeId: true },
      distinct: ["employeeId"],
    });
    availabilitySubmitted = submittedEmployees.length;
  }

  // "Requires attention" count
  const attentionCount =
    todayEmpty.length + Math.max(0, availabilityTotal - availabilitySubmitted);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-extrabold text-brown-900">
            שלום, {currentManager.name} 👋
          </h2>
          <p className="text-sm text-brown-500">
            {restaurant.name} ·{" "}
            {new Intl.DateTimeFormat("he-IL", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
              timeZone: process.env.APP_TIME_ZONE ?? "Asia/Jerusalem",
            }).format(now)}
          </p>
        </div>
        <Link href="/settings">
          <Button variant="secondary" size="sm">
            הגדרות החשבון
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="עובדים פעילים"
          value={employeeCount}
          href="/employees"
          hint="ניהול עובדים"
          icon="👥"
          iconBg="bg-brand-100"
        />
        <Stat
          label="משבצות בתבנית"
          value={templateCount}
          href="/shift-template"
          hint={templateCount === 0 ? "טרם הוגדרה" : "ערוך תבנית"}
          icon="📐"
          iconBg="bg-amber-50"
        />
        <Stat
          label="הגישו זמינות"
          value={`${availabilitySubmitted}/${availabilityTotal}`}
          href="/availability"
          hint={
            availabilitySubmitted === availabilityTotal
              ? "כולם הגישו"
              : `${availabilityTotal - availabilitySubmitted} חסרים`
          }
          icon="✅"
          iconBg="bg-emerald-50"
        />
        <Stat
          label="דורש טיפול"
          value={attentionCount}
          hint={attentionCount === 0 ? "הכל תקין" : "משבצות ריקות + זמינות חסרה"}
          icon="⚠️"
          iconBg="bg-rose-50"
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        {/* Today's shifts — wider panel */}
        <div className="lg:col-span-3">
          <Card className="h-full">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>
                🍽 המשמרות של היום ·{" "}
                <span className="font-medium text-brown-500">
                  {DAY_NAMES_HE[todayDow as DayOfWeek]}
                </span>
              </CardTitle>
              {todayWeek && (
                <Link href={`/schedule/${todayWeek.id}`}>
                  <Button variant="secondary" size="sm">
                    פתח סידור
                  </Button>
                </Link>
              )}
            </CardHeader>
            <CardBody>
              {!todayWeek ? (
                <div className="py-6 text-center">
                  <p className="text-sm text-brown-500">
                    אין סידור לשבוע הנוכחי
                  </p>
                  <Link href="/schedule" className="mt-2 inline-block text-sm text-brand-600 hover:underline">
                    צור סידור חדש →
                  </Link>
                </div>
              ) : todayAssignments.length === 0 && todayEmpty.length === 0 ? (
                <div className="py-6 text-center">
                  <p className="text-sm text-brown-500">
                    אין משמרות מתוכננות להיום
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {groupByShift(todayAssignments).map(([shiftType, items]) => {
                    const def = SHIFT_DEFS[shiftType as ShiftType];
                    if (!def) return null;
                    return (
                      <div key={shiftType}>
                        <div className="mb-1 flex items-center gap-2">
                          <span className="text-xs font-bold text-brown-500">
                            {def.labelHe}
                          </span>
                          <span className="num text-[11px] text-brown-400">
                            {def.start}–{def.end}
                          </span>
                        </div>
                        {items.map((a, i) => (
                          <div
                            key={i}
                            className="mb-1 flex items-center gap-3 rounded-xl border border-cream-200 bg-cream-50/60 px-3 py-2.5"
                          >
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                              {a.employeeName.slice(0, 2)}
                            </div>
                            <div className="flex-1">
                              <div className="text-sm font-semibold text-brown-800">
                                {a.employeeName}
                              </div>
                            </div>
                            <Badge tone="neutral" className="text-[11px]">
                              {roleBadge(a.employeeRole)}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                  {todayEmpty.length > 0 && (
                    <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50/60 px-3 py-2.5">
                      <span className="text-xs font-semibold text-rose-700">
                        {todayEmpty.length} משבצות ריקות
                      </span>
                      <div className="mt-1 space-y-0.5">
                        {todayEmpty.map((e, i) => {
                          const def = SHIFT_DEFS[e.shiftType as ShiftType];
                          return (
                            <div key={i} className="text-xs text-rose-600">
                              {def?.labelHe ?? e.shiftType} · #{e.slotIndex + 1}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardBody>
          </Card>
        </div>

        {/* Activity panel */}
        <div className="lg:col-span-2">
          <Card className="h-full">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>🔔 עדכונים אחרונים</CardTitle>
              {recentLogs.length > 0 && (
                <Badge tone="brand">{recentLogs.length}</Badge>
              )}
            </CardHeader>
            <CardBody>
              {recentLogs.length === 0 ? (
                <p className="py-4 text-center text-sm text-brown-500">
                  אין עדכונים עדיין
                </p>
              ) : (
                <div className="space-y-1">
                  {recentLogs.map((log) => (
                    <div
                      key={log.id}
                      className="flex gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-cream-50"
                    >
                      <div
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm",
                          activityStyle(log.action).bg,
                        )}
                      >
                        {activityStyle(log.action).icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-brown-700">
                          {formatActivity(log.action, log.payload as Record<string, unknown>, log.manager?.name)}
                        </p>
                        <p className="mt-0.5 text-[11px] text-brown-400 num">
                          {formatRelativeTime(log.createdAt)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>צעדים ראשונים</CardTitle>
        </CardHeader>
        <CardBody>
          <ol className="space-y-2 text-sm text-brown-700">
            <Step
              done={employeeCount > 0}
              text="הוספת עובדים ותפקיד (מטבח / פלור / שניהם)"
              cta={{ href: "/employees", label: "ניהול עובדים" }}
            />
            <Step
              done={templateCount > 0}
              text="הגדרת תבנית משמרות שבועית — כמה אנשים בכל משמרת"
              cta={{ href: "/shift-template", label: "פתח תבנית" }}
            />
            <Step
              done={!!anyAvailability}
              text="קליטת זמינות עובדים מ-WhatsApp או טופס נייד"
              cta={{ href: "/availability", label: "קלוט זמינות" }}
            />
            <Step
              done={!!anySchedule}
              text="יצירת סידור אוטומטי לשבוע הבא"
              cta={{ href: "/schedule", label: "פתח סידור" }}
            />
          </ol>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>היסטוריית שבועות</CardTitle>
          </CardHeader>
          <CardBody>
            {latestWeek ? (
              <div className="space-y-2">
                <p className="text-sm text-brown-600">
                  השבוע האחרון:{" "}
                  <span className="num">
                    {new Intl.DateTimeFormat("he-IL").format(latestWeek.weekStart)}
                  </span>{" "}
                  · סטטוס:{" "}
                  <Badge tone={latestWeek.status === "approved" ? "success" : "warning"}>
                    {latestWeek.status === "approved" ? "מאושר" : "טיוטה"}
                  </Badge>
                </p>
                <Link href="/schedule" className="text-xs text-brand-600 hover:underline">
                  כל הסידורים →
                </Link>
              </div>
            ) : (
              <p className="text-sm text-brown-500">עוד אין שבועות מתוזמנים.</p>
            )}
          </CardBody>
        </Card>

        <Link href="/analytics" className="block transition-transform hover:-translate-y-0.5">
          <Card className="h-full bg-gradient-to-br from-brand-50 to-teal-50/40 border-brand-200/60">
            <CardBody className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-2xl">
                📊
              </div>
              <div>
                <div className="text-sm font-bold text-brown-900">אנליטיקס</div>
                <div className="mt-0.5 text-xs text-brown-500">
                  שעות, סגירות, חלוקה לפי עובד
                </div>
                <div className="mt-1 text-xs font-medium text-brand-600">
                  פתח דוחות →
                </div>
              </div>
            </CardBody>
          </Card>
        </Link>
      </div>
    </div>
  );
}

function groupByShift(
  items: Array<{ shiftType: string; employeeName: string; employeeRole: string; slotIndex: number }>,
): [string, typeof items][] {
  const map = new Map<string, typeof items>();
  for (const item of items) {
    const arr = map.get(item.shiftType) ?? [];
    arr.push(item);
    map.set(item.shiftType, arr);
  }
  return Array.from(map.entries()).sort(([a], [b]) => {
    const order = ALL_SHIFT_TYPES as readonly string[];
    return order.indexOf(a) - order.indexOf(b);
  });
}

function activityStyle(action: string): { icon: string; bg: string } {
  switch (action) {
    case "generate_schedule":
      return { icon: "🤖", bg: "bg-brand-100" };
    case "approve_schedule":
      return { icon: "✅", bg: "bg-emerald-100" };
    case "unapprove_schedule":
      return { icon: "↩️", bg: "bg-amber-100" };
    case "manual_assign":
    case "manual_clear":
    case "manual_reassign":
      return { icon: "✏️", bg: "bg-sky-100" };
    case "lock_slot":
    case "unlock_slot":
      return { icon: "🔒", bg: "bg-violet-100" };
    case "clear_all_assignments":
      return { icon: "🗑", bg: "bg-rose-100" };
    default:
      return { icon: "📋", bg: "bg-warm-100" };
  }
}

function formatActivity(
  action: string,
  payload: Record<string, unknown>,
  managerName?: string | null,
): string {
  const who = managerName ?? "מנהל";
  switch (action) {
    case "generate_schedule":
      return `${who} יצר סידור אוטומטי`;
    case "approve_schedule":
      return `${who} אישר את הסידור`;
    case "unapprove_schedule":
      return `${who} ביטל אישור הסידור`;
    case "manual_assign": {
      const empName = (payload as Record<string, unknown>)?.employeeName;
      return empName
        ? `${who} שיבץ ידנית את ${empName}`
        : `${who} שיבץ ידנית`;
    }
    case "manual_clear":
      return `${who} הסיר שיבוץ`;
    case "manual_reassign": {
      const toName = (payload as Record<string, unknown>)?.toEmployeeName;
      return toName
        ? `${who} העביר שיבוץ ל${toName}`
        : `${who} העביר שיבוץ`;
    }
    case "lock_slot":
      return `${who} נעל משבצת`;
    case "unlock_slot":
      return `${who} שחרר נעילת משבצת`;
    case "clear_all_assignments":
      return `${who} מחק את כל השיבוצים`;
    default:
      return `${who} · ${action}`;
  }
}

function formatRelativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "הרגע";
  if (minutes < 60) return `לפני ${minutes} דקות`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `לפני ${hours} שעות`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "אתמול";
  return `לפני ${days} ימים`;
}

function Stat({
  label,
  value,
  hint,
  href,
  icon,
  iconBg,
}: {
  label: string;
  value: string | number;
  hint?: string;
  href?: string;
  icon: string;
  iconBg: string;
}) {
  const inner = (
    <Card className="h-full">
      <CardBody>
        <div className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl text-lg ${iconBg}`}>
          {icon}
        </div>
        <div className="text-xs font-medium text-brown-500">{label}</div>
        <div className="mt-1 text-3xl font-extrabold text-brown-900">{value}</div>
        {hint && <div className="mt-1 text-xs text-brown-400">{hint}</div>}
      </CardBody>
    </Card>
  );
  return href ? (
    <Link href={href} className="block transition-transform hover:-translate-y-0.5">
      {inner}
    </Link>
  ) : (
    inner
  );
}

function Step({
  done,
  text,
  cta,
  disabled,
}: {
  done: boolean;
  text: string;
  cta: { href: string; label: string };
  disabled?: boolean;
}) {
  return (
    <li className="flex items-center justify-between gap-4 rounded-xl border border-cream-200 bg-cream-50 px-4 py-3">
      <div className="flex items-center gap-3">
        <span
          className={
            done
              ? "inline-flex h-[26px] w-[26px] items-center justify-center rounded-full bg-brand-500 text-xs text-white"
              : "inline-flex h-[26px] w-[26px] items-center justify-center rounded-full border-2 border-dashed border-cream-300 text-brown-400"
          }
        >
          {done ? "✓" : ""}
        </span>
        <span className={done ? "text-brown-400 line-through" : ""}>{text}</span>
      </div>
      {disabled ? (
        <span className="text-xs text-brown-400">{cta.label}</span>
      ) : (
        <Link href={cta.href}>
          <Button variant="secondary" size="sm">
            {cta.label}
          </Button>
        </Link>
      )}
    </li>
  );
}
