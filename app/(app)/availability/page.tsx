import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  getOrCreateWeek,
  parseWeekStartParam,
  formatWeekParam,
  formatWeekRange,
} from "@/lib/week";
import { WeekPicker } from "@/components/week-picker";
import { PasteIngest } from "@/components/paste-ingest";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { WEEK_NOTE_SHIFT_TYPE } from "@/lib/shifts";
import { roleBadge } from "@/lib/role-labels";

export default async function AvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.restaurantId) redirect("/login");
  const restaurantId = session.user.restaurantId;
  const sp = await searchParams;
  const weekStart = parseWeekStartParam(sp.week);
  const week = await getOrCreateWeek(restaurantId, weekStart);

  const [employees, submissions, parsedRows] = await Promise.all([
    prisma.employee.findMany({
      where: { restaurantId, archived: false },
      orderBy: { name: "asc" },
    }),
    prisma.rawSubmission.findMany({
      where: { weekId: week.id },
      include: { employee: true },
      orderBy: { submittedAt: "desc" },
    }),
    prisma.parsedAvailability.findMany({ where: { weekId: week.id } }),
  ]);

  // Quick per-employee summary: how many parsed rows + mean confidence
  const summary = new Map<string, { rows: number; conf: number }>();
  for (const r of parsedRows) {
    if (r.shiftType === WEEK_NOTE_SHIFT_TYPE) continue;
    const cur = summary.get(r.employeeId) ?? { rows: 0, conf: 0 };
    summary.set(r.employeeId, { rows: cur.rows + 1, conf: cur.conf + r.confidence });
  }

  // Per-employee availability status
  const employeesWithAvailability = new Set(
    parsedRows
      .filter((r) => r.shiftType !== WEEK_NOTE_SHIFT_TYPE)
      .map((r) => r.employeeId),
  );

  const submittedCount = employees.filter((e) =>
    employeesWithAvailability.has(e.id),
  ).length;
  const missingCount = employees.length - submittedCount;
  const missingEmployees = employees.filter(
    (e) => !employeesWithAvailability.has(e.id),
  );

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h2 className="text-2xl font-extrabold text-brown-900">זמינות עובדים</h2>
        <p className="text-sm text-brown-500">
          קליטת הודעות זמינות לשבוע{" "}
          <span className="num">{formatWeekRange(weekStart)}</span>
        </p>
      </div>

      <WeekPicker weekStart={weekStart} basePath="/availability" />

      {/* Availability status summary */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>סטטוס הגשת זמינות</CardTitle>
          <div className="flex items-center gap-2">
            <Badge tone="success">{submittedCount} הגישו</Badge>
            {missingCount > 0 && (
              <Badge tone="danger">{missingCount} חסרים</Badge>
            )}
          </div>
        </CardHeader>
        <CardBody>
          <div className="mb-3">
            <div className="flex items-center gap-3">
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-cream-200">
                <div
                  className="h-full rounded-full bg-brand-500 transition-all"
                  style={{
                    width: employees.length > 0
                      ? `${(submittedCount / employees.length) * 100}%`
                      : "0%",
                  }}
                />
              </div>
              <span className="text-sm font-bold text-brown-700 num">
                {submittedCount}/{employees.length}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {employees.map((e) => {
              const submitted = employeesWithAvailability.has(e.id);
              return (
                <div
                  key={e.id}
                  className="flex items-center justify-between rounded-lg border border-cream-200 px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-brown-800">
                      {e.name}
                    </span>
                    <span className="text-[11px] text-brown-400">
                      {roleBadge(e.role)}
                    </span>
                  </div>
                  {submitted ? (
                    <Badge tone="success">✅ הוגש</Badge>
                  ) : (
                    <Badge tone="danger">❌ חסר</Badge>
                  )}
                </div>
              );
            })}
          </div>
        </CardBody>
      </Card>

      {/* Chase missing employees */}
      {missingEmployees.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/40">
          <CardHeader>
            <CardTitle className="text-amber-900">
              📞 {missingEmployees.length} עובדים טרם הגישו זמינות
            </CardTitle>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {missingEmployees.map((e) => (
                <div
                  key={e.id}
                  className="flex items-center justify-between rounded-lg border border-amber-200 bg-white px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-brown-900">{e.name}</span>
                    <span className="text-[11px] text-brown-400">{roleBadge(e.role)}</span>
                  </div>
                  <Link href={`/employees/${e.id}`} className="text-xs text-brand-600 hover:underline">
                    קישור →
                  </Link>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-amber-700">
              לחץ על &quot;קישור&quot; לצפייה בדף העובד ושליחת הקישור האישי שלהם.
            </p>
          </CardBody>
        </Card>
      )}

      <PasteIngest
        weekStart={formatWeekParam(weekStart)}
        weekId={week.id}
        employees={employees.map((e) => ({
          id: e.id,
          name: e.name,
          role: e.role,
        }))}
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>הגשות לשבוע זה</CardTitle>
            {submissions.length > 0 && (
              <Link href={`/availability/review/${week.id}`}>
                <Button size="sm" variant="secondary">
                  פתח דף סקירה
                </Button>
              </Link>
            )}
          </CardHeader>
          <CardBody>
            {submissions.length === 0 ? (
              <p className="text-sm text-brown-500">
                טרם נקלטו הגשות. הדבק/י הודעות למעלה או שלח/י קישור אישי לעובד.
              </p>
            ) : (
              <ul className="space-y-2">
                {(() => {
                  const latestByEmp = new Map<string, typeof submissions[number]>();
                  const countByEmp = new Map<string, number>();
                  for (const s of submissions) {
                    const key = s.employeeId ?? s.id;
                    countByEmp.set(key, (countByEmp.get(key) ?? 0) + 1);
                    if (!latestByEmp.has(key)) latestByEmp.set(key, s);
                  }
                  return Array.from(latestByEmp.values()).map((s) => {
                    const key = s.employeeId ?? s.id;
                    const stats = summary.get(s.employeeId ?? "");
                    const meanConf = stats ? stats.conf / stats.rows : 0;
                    const count = countByEmp.get(key) ?? 1;
                    return (
                      <li
                        key={s.id}
                        className="flex items-center justify-between rounded-xl border border-cream-200 bg-cream-50/50 px-3 py-2"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-brown-900">
                              {s.employee?.name ?? "(לא מתויג)"}
                            </span>
                            {s.employee?.role && (
                              <span className="text-[11px] text-brown-400">
                                {roleBadge(s.employee.role)}
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 text-xs text-brown-500">
                            {s.source === "form" ? "טופס" : "הדבקה"} ·{" "}
                            {new Intl.DateTimeFormat("he-IL", {
                              day: "numeric",
                              month: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            }).format(s.submittedAt)}
                            {count > 1 && (
                              <span className="text-amber-600"> · עודכן {count} פעמים</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {stats ? (
                            <Badge tone={confTone(meanConf)}>
                              {stats.rows} שורות · {Math.round(meanConf * 100)}%
                            </Badge>
                          ) : (
                            <Badge tone="warning">ממתין לפענוח</Badge>
                          )}
                        </div>
                      </li>
                    );
                  });
                })()}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>קישורים אישיים לעובדים</CardTitle>
          </CardHeader>
          <CardBody>
            <p className="mb-3 text-xs text-brown-500">
              שלח/י לעובדים את הקישור האישי שלהם — הם ימלאו טופס מובייל ידידותי.
            </p>
            <ul className="space-y-1.5">
              {employees.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center justify-between rounded-lg border border-cream-200 px-3 py-2 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-brown-700">{e.name}</span>
                    <span className="text-[11px] text-brown-400">
                      {roleBadge(e.role)}
                    </span>
                  </div>
                  <Link
                    href={`/employees/${e.id}`}
                    className="text-xs text-brand-600 hover:underline"
                  >
                    קישור ←
                  </Link>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function confTone(c: number): "success" | "warning" | "danger" {
  if (c >= 0.85) return "success";
  if (c >= 0.6) return "warning";
  return "danger";
}
