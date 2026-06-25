import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatWeekRange } from "@/lib/week";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExportWeekButtons } from "@/components/export-week-buttons";

export default async function ExportIndexPage() {
  const session = await auth();
  if (!session?.user?.restaurantId) redirect("/login");
  const restaurantId = session.user.restaurantId;

  // Pull recent weeks with their assignment counts
  const weeks = await prisma.week.findMany({
    where: { restaurantId },
    orderBy: { weekStart: "desc" },
    take: 20,
    include: {
      _count: {
        select: { assignments: true },
      },
    },
  });

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h2 className="text-2xl font-extrabold text-brown-900">ייצוא סידורים</h2>
        <p className="text-sm text-brown-500">
          הדפסה / PDF, ייצוא ל-Excel, או שמירה כתמונה לשליחה בוואטסאפ
        </p>
      </div>

      {weeks.length === 0 ? (
        <Card>
          <CardBody className="py-12 text-center text-sm text-brown-500">
            אין שבועות לייצוא. צרו סידור בעמוד{" "}
            <Link href="/schedule" className="text-brand-600 hover:underline">
              סידור שבועי
            </Link>{" "}
            ראשית.
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-3">
          {weeks.map((w) => (
            <Card key={w.id}>
              <CardBody className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-semibold text-brown-900 num">
                      {formatWeekRange(w.weekStart)}
                    </span>
                    {w.status === "approved" ? (
                      <Badge tone="success">מאושר</Badge>
                    ) : (
                      <Badge tone="warning">טיוטה</Badge>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-brown-500">
                    <span className="num">{w._count.assignments}</span> שיבוצים
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/schedule/${w.id}`}>
                    <Button variant="ghost" size="sm">
                      פתח לעריכה
                    </Button>
                  </Link>
                  <ExportWeekButtons weekId={w.id} />
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
