import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShareFormCard } from "@/components/share-form-card";

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.restaurantId) redirect("/login");
  const restaurantId = session.user.restaurantId;
  const sp = await searchParams;
  const showArchived = sp.archived === "1";

  const employees = await prisma.employee.findMany({
    where: { restaurantId, archived: showArchived },
    orderBy: { name: "asc" },
  });

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">עובדים</h2>
          <p className="text-sm text-slate-500">
            {employees.length} עובדים {showArchived ? "בארכיון" : "פעילים"}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/employees?archived=${showArchived ? "0" : "1"}`}>
            <Button variant="secondary">
              {showArchived ? "צפייה בפעילים" : "צפייה בארכיון"}
            </Button>
          </Link>
          <Link href="/employees/new">
            <Button>הוספת עובד</Button>
          </Link>
        </div>
      </div>

      {!showArchived && (
        <ShareFormCard
          path="/employee/login"
          label="קישור התחברות משותף לעובדים"
        />
      )}

      {employees.length === 0 ? (
        <Card>
          <CardBody className="py-12 text-center text-sm text-slate-500">
            אין עובדים {showArchived ? "בארכיון" : "פעילים"}.
            {!showArchived && (
              <div className="mt-4">
                <Link href="/employees/new">
                  <Button>הוסיפו את העובד הראשון</Button>
                </Link>
              </div>
            )}
          </CardBody>
        </Card>
      ) : (
        <Card>
          <div className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-start">
                <tr className="text-slate-500">
                  <th className="px-5 py-3 text-start font-medium">שם</th>
                  <th className="px-5 py-3 text-start font-medium">תפקיד</th>
                  <th className="px-5 py-3 text-start font-medium">משמרות</th>
                  <th className="px-5 py-3 text-start font-medium">העדפות</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {employees.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-medium text-slate-900">
                      {e.name}
                    </td>
                    <td className="px-5 py-3">
                      <RoleBadge role={e.role} />
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {e.minShifts != null || e.maxShifts != null ? (
                        <span className="num">
                          {e.minShifts ?? "—"} - {e.maxShifts ?? "—"}
                        </span>
                      ) : (
                        <span className="text-slate-400">לא הוגדר</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-1">
                        {e.onlyMornings && <Badge tone="neutral">רק בקרים</Badge>}
                        {e.onlyEvenings && <Badge tone="neutral">רק ערבים</Badge>}
                        {e.noClosings && <Badge tone="warning">בלי סגירות</Badge>}
                        {!e.weekendOk && <Badge tone="warning">לא ש״ש</Badge>}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-end">
                      <Link href={`/employees/${e.id}`}>
                        <Button variant="ghost" size="sm">
                          ערוך
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  if (role === "kitchen") return <Badge tone="kitchen">מטבח</Badge>;
  if (role === "floor") return <Badge tone="floor">פלור</Badge>;
  return (
    <span className="inline-flex gap-1">
      <Badge tone="kitchen">מטבח</Badge>
      <Badge tone="floor">פלור</Badge>
    </span>
  );
}
