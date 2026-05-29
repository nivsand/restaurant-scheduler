import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatWeekRange } from "@/lib/week";
import { AvailabilityGrid, ParsedRow } from "@/components/availability-grid";
import {
  AvailabilitySummaryGrid,
  SummaryAvailabilityRow,
} from "@/components/availability-summary-grid";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RequestedShiftsEditor } from "@/components/requested-shifts-editor";
import { SHIFT_DEFS, ShiftType } from "@/lib/shifts";
import {
  deleteSubmissionAction,
  confirmAvailabilityAction,
} from "../../actions";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ weekId: string }>;
}) {
  const { weekId } = await params;
  const session = await auth();
  const restaurantId = session!.user.restaurantId;

  const week = await prisma.week.findFirst({
    where: { id: weekId, restaurantId },
    include: { overrides: true },
  });
  if (!week) notFound();

  const [employees, parsed, submissions, templates] = await Promise.all([
    prisma.employee.findMany({
      where: { restaurantId, archived: false },
      orderBy: { name: "asc" },
    }),
    prisma.parsedAvailability.findMany({ where: { weekId } }),
    prisma.rawSubmission.findMany({
      where: { weekId },
      orderBy: { submittedAt: "desc" },
    }),
    prisma.shiftTemplate.findMany({ where: { restaurantId } }),
  ]);

  // Latest requestedShifts per employee for this week
  const requestedByEmp = new Map<string, number | null>();
  for (const s of submissions) {
    if (!s.employeeId) continue;
    if (requestedByEmp.has(s.employeeId)) continue;
    requestedByEmp.set(s.employeeId, s.requestedShifts);
  }

  // Build headcount map (template + per-week overrides) and a per-(day, shiftType) cells map
  const headcountMap = new Map<string, number>();
  for (const t of templates) headcountMap.set(`${t.day}:${t.shiftType}`, t.headcount);
  for (const o of week.overrides) headcountMap.set(`${o.day}:${o.shiftType}`, o.headcount);

  const empById = new Map(employees.map((e) => [e.id, e]));
  const summaryRowsMap = new Map<string, SummaryAvailabilityRow>();
  let invalidRoleRows = 0;
  for (const p of parsed) {
    const key = `${p.day}:${p.shiftType}`;
    const emp = empById.get(p.employeeId);
    if (!emp) continue;
    // Defensive: drop rows where the employee's role doesn't match the shift's role.
    // This protects against legacy bad data from before the server-side guard.
    const def = SHIFT_DEFS[p.shiftType as ShiftType];
    if (def && emp.role !== "both" && def.role !== emp.role) {
      invalidRoleRows += 1;
      continue;
    }
    if (!summaryRowsMap.has(key)) {
      summaryRowsMap.set(key, { day: p.day, shiftType: p.shiftType, cells: [] });
    }
    summaryRowsMap.get(key)!.cells.push({
      employeeId: emp.id,
      employeeName: emp.name,
      employeeRole: emp.role,
      confidence: p.confidence,
      confirmed: p.confirmed,
    });
  }
  // Sort employees in each cell alphabetically for stable display
  for (const r of summaryRowsMap.values()) {
    r.cells.sort((a, b) => a.employeeName.localeCompare(b.employeeName, "he"));
  }
  const summaryRows = Array.from(summaryRowsMap.values());

  // Group submissions by employee. Latest first.
  const byEmployee = new Map<string, typeof submissions>();
  for (const s of submissions) {
    if (!s.employeeId) continue;
    const arr = byEmployee.get(s.employeeId) ?? [];
    arr.push(s);
    byEmployee.set(s.employeeId, arr);
  }

  const employeesWithData = employees
    .filter(
      (e) =>
        byEmployee.has(e.id) || parsed.some((p) => p.employeeId === e.id),
    )
    .sort((a, b) => a.name.localeCompare(b.name, "he"));

  // Aggregate stats
  const totalRows = parsed.length;
  const lowConf = parsed.filter((p) => p.confidence < 0.6).length;
  const llmCount = parsed.filter((p) => p.source === "llm").length;
  const manualCount = parsed.filter((p) => p.source === "manual").length;
  const unconfirmedCount = parsed.filter((p) => !p.confirmed).length;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <Link
            href={`/availability?week=${encodeURIComponent(week.weekStart.toISOString())}`}
            className="text-sm text-slate-500 hover:text-slate-700"
          >
            ← חזרה לקליטה
          </Link>
          <h2 className="mt-1 text-2xl font-bold text-slate-900">
            סקירת זמינות
          </h2>
          <p className="text-sm text-slate-500 num">
            {formatWeekRange(week.weekStart)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="עובדים פעילים" value={employeesWithData.length} />
        <Stat label="סה״כ תאי זמינות" value={totalRows} />
        <Stat
          label="לא מאושר"
          value={unconfirmedCount}
          tone={unconfirmedCount > 0 ? "danger" : "success"}
        />
        <Stat label="פענוח LLM" value={llmCount} />
      </div>

      {invalidRoleRows > 0 && (
        <Card className="border-amber-200 bg-amber-50/40">
          <CardBody className="text-sm text-amber-900">
            <span className="font-medium">{invalidRoleRows}</span> רשומות זמינות
            סוננו אוטומטית כי תפקיד העובד לא תאם למשמרת (למשל פלור על משמרת
            מטבח). הן לא יוצגו או יישלחו למנוע הסידור.
          </CardBody>
        </Card>
      )}

      {summaryRows.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>טבלת זמינות כללית</CardTitle>
            <span className="text-xs text-slate-500">
              שורות = משמרות · עמודות = ימים · תאים = עובדים זמינים
            </span>
          </CardHeader>
          <CardBody className="p-0">
            <AvailabilitySummaryGrid
              rows={summaryRows}
              headcounts={headcountMap}
            />
          </CardBody>
        </Card>
      )}

      {unconfirmedCount > 0 && (
        <Card className="border-amber-200 bg-amber-50/40">
          <CardBody className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-amber-900">
                {unconfirmedCount} תאי זמינות בביטחון נמוך טרם אושרו
              </div>
              <p className="mt-1 text-xs text-amber-800">
                מנוע הסידור לא ישתמש בתאים אלו עד שתאשרו אותם. לחיצה על תא בודד
                בגריד מאשרת אותו ספציפית.
              </p>
            </div>
            <form
              action={async () => {
                "use server";
                await confirmAvailabilityAction(JSON.stringify({ weekId }));
              }}
            >
              <Button type="submit" variant="secondary">
                אשר את כולם
              </Button>
            </form>
          </CardBody>
        </Card>
      )}

      {employeesWithData.length === 0 ? (
        <Card>
          <CardBody className="py-12 text-center text-sm text-slate-500">
            עדיין אין נתוני זמינות לשבוע זה.
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-4">
          {employeesWithData.map((emp) => {
            // Filter out role-mismatched rows for this employee's grid display too
            const empParsed = parsed.filter((p) => {
              if (p.employeeId !== emp.id) return false;
              const def = SHIFT_DEFS[p.shiftType as ShiftType];
              if (def && emp.role !== "both" && def.role !== emp.role) return false;
              return true;
            });
            const empSubs = byEmployee.get(emp.id) ?? [];
            const latest = empSubs[0];
            const conf =
              empParsed.length > 0
                ? empParsed.reduce((s, r) => s + r.confidence, 0) /
                  empParsed.length
                : 0;
            const rows: ParsedRow[] = empParsed.map((p) => ({
              day: p.day,
              shiftType: p.shiftType,
              available: p.available,
              confidence: p.confidence,
              source: p.source,
              confirmed: p.confirmed,
              note: p.note,
            }));
            const empUnconfirmed = empParsed.filter((p) => !p.confirmed).length;
            return (
              <Card key={emp.id}>
                <CardHeader className="flex flex-row items-start justify-between gap-3">
                  <div>
                    <CardTitle>{emp.name}</CardTitle>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <Badge
                        tone={
                          emp.role === "kitchen"
                            ? "kitchen"
                            : emp.role === "floor"
                              ? "floor"
                              : "neutral"
                        }
                      >
                        {emp.role === "kitchen"
                          ? "מטבח"
                          : emp.role === "floor"
                            ? "פלור"
                            : "שניהם"}
                      </Badge>
                      {empParsed.length > 0 && (
                        <Badge tone={confTone(conf)}>
                          {empParsed.length} תאים · {Math.round(conf * 100)}% ביטחון
                        </Badge>
                      )}
                      {empUnconfirmed > 0 && (
                        <Badge tone="warning">
                          {empUnconfirmed} לא מאושר
                        </Badge>
                      )}
                      {latest && (
                        <span>
                          {latest.source === "form" ? "טופס" : "הדבקה"} ·{" "}
                          {new Intl.DateTimeFormat("he-IL", {
                            day: "numeric",
                            month: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          }).format(latest.submittedAt)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {empUnconfirmed > 0 && (
                      <form
                        action={async () => {
                          "use server";
                          await confirmAvailabilityAction(
                            JSON.stringify({ weekId, employeeId: emp.id }),
                          );
                        }}
                      >
                        <Button type="submit" variant="ghost" size="sm">
                          אשר {empUnconfirmed}
                        </Button>
                      </form>
                    )}
                    {latest && (
                      <form
                        action={async () => {
                          "use server";
                          await deleteSubmissionAction(latest.id);
                        }}
                      >
                        <Button
                          type="submit"
                          variant="ghost"
                          size="sm"
                          className="text-rose-600 hover:bg-rose-50"
                        >
                          מחק
                        </Button>
                      </form>
                    )}
                  </div>
                </CardHeader>
                <CardBody>
                  <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
                    <AvailabilityGrid
                      weekId={weekId}
                      employeeId={emp.id}
                      rows={rows}
                    />
                    {latest && (
                      <div className="lg:min-w-[200px]">
                        <div className="mb-1 text-xs font-medium text-slate-500">
                          {latest.source === "form" ? "פירוט מהטופס" : "ההודעה המקורית"}
                        </div>
                        <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-700">
                          {latest.content}
                        </pre>
                      </div>
                    )}
                  </div>
                  <RequestedShiftsEditor
                    weekId={weekId}
                    employeeId={emp.id}
                    initial={requestedByEmp.get(emp.id) ?? null}
                  />
                  {empParsed.some((p) => p.note) && (
                    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/60 p-2 text-xs text-amber-900">
                      <span className="font-medium">הערה מהעובד:</span>{" "}
                      {Array.from(
                        new Set(empParsed.map((p) => p.note).filter(Boolean)),
                      ).join(" · ")}
                    </div>
                  )}
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}

      <div className="rounded-2xl bg-white p-4 text-xs text-slate-500 ring-1 ring-slate-100">
        <div className="mb-2 font-medium text-slate-700">מקרא צבעים</div>
        <div className="flex flex-wrap gap-3">
          <Legend tone="bg-emerald-500" label="ביטחון גבוה (85%+)" />
          <Legend tone="bg-amber-400" label="ביטחון בינוני (60-85%)" />
          <Legend tone="bg-rose-500" label="ביטחון נמוך (פחות מ-60%)" />
          <Legend tone="bg-brand-500" label="עריכה ידנית" />
          <span className="ms-3">
            עריכת LLM = פלוט {manualCount > 0 && `· ${manualCount} ידני`}
          </span>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "success" | "danger";
}) {
  return (
    <div className="rounded-2xl bg-white px-4 py-3 ring-1 ring-slate-200">
      <div className="text-xs text-slate-500">{label}</div>
      <div
        className={`mt-1 text-xl font-bold ${
          tone === "danger"
            ? "text-rose-600"
            : tone === "success"
              ? "text-emerald-600"
              : "text-slate-900"
        } num`}
      >
        {value}
      </div>
    </div>
  );
}

function Legend({ tone, label }: { tone: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-3 w-3 rounded ${tone}`} />
      <span>{label}</span>
    </span>
  );
}

function confTone(c: number): "success" | "warning" | "danger" {
  if (c >= 0.85) return "success";
  if (c >= 0.6) return "warning";
  return "danger";
}
