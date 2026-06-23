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

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (!hasValidSessionUser(session)) redirect(clearSessionPath("/login"));

  const currentManager = await getActiveManagerForSession(session);
  if (!currentManager) redirect(clearSessionPath("/login"));

  const restaurantId = currentManager.restaurantId;

  const [restaurant, employeeCount, templateCount, latestWeek, anyAvailability, anySchedule] =
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
    ]);

  if (!restaurant) redirect(clearSessionPath("/login"));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">
            שלום, {currentManager.name}
          </h2>
          <p className="text-sm text-slate-500">
            לוח בקרה · {restaurant.name}
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
        />
        <Stat
          label="משבצות בתבנית"
          value={templateCount}
          href="/shift-template"
          hint={templateCount === 0 ? "טרם הוגדרה" : "ערוך תבנית"}
        />
        <Stat
          label="שעות מנוחה מינ׳"
          value={`${restaurant.minRestHours}`}
          hint="בין משמרת לשניה"
        />
        <Stat
          label="שבועות בהיסטוריה"
          value={latestWeek ? "פעיל" : "—"}
          hint={latestWeek?.status === "approved" ? "מאושר" : "טרם"}
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>צעדים ראשונים</CardTitle>
        </CardHeader>
        <CardBody>
          <ol className="space-y-3 text-sm text-slate-700">
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

      <Card>
        <CardHeader>
          <CardTitle>היסטוריית שבועות</CardTitle>
        </CardHeader>
        <CardBody>
          {latestWeek ? (
            <p className="text-sm text-slate-600">
              השבוע האחרון:{" "}
              <span className="num">
                {new Intl.DateTimeFormat("he-IL").format(latestWeek.weekStart)}
              </span>{" "}
              · סטטוס:{" "}
              <Badge tone={latestWeek.status === "approved" ? "success" : "warning"}>
                {latestWeek.status === "approved" ? "מאושר" : "טיוטה"}
              </Badge>
            </p>
          ) : (
            <p className="text-sm text-slate-500">עוד אין שבועות מתוזמנים.</p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  href,
}: {
  label: string;
  value: string | number;
  hint?: string;
  href?: string;
}) {
  const inner = (
    <Card className="h-full">
      <CardBody>
        <div className="text-xs font-medium text-slate-500">{label}</div>
        <div className="mt-2 text-3xl font-bold text-slate-900">{value}</div>
        {hint && <div className="mt-1 text-xs text-slate-400">{hint}</div>}
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
    <li className="flex items-center justify-between gap-4 rounded-lg border border-slate-100 px-3 py-2">
      <div className="flex items-center gap-3">
        <span
          className={
            done
              ? "inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white"
              : "inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 text-slate-400"
          }
        >
          {done ? "✓" : ""}
        </span>
        <span className={done ? "text-slate-500 line-through" : ""}>{text}</span>
      </div>
      {disabled ? (
        <span className="text-xs text-slate-400">{cta.label}</span>
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
