import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ManagerRowActions } from "@/components/manager-row-actions";
import { createManagerAction } from "./actions";

export default async function UsersPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const caller = await prisma.manager.findUnique({
    where: { id: session.user.id },
  });
  // Admin-only page. Non-admins are bounced to the dashboard.
  if (!caller || !caller.active || !caller.isAdmin) redirect("/dashboard");

  const managers = await prisma.manager.findMany({
    where: { restaurantId: caller.restaurantId },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h2 className="text-2xl font-extrabold text-brown-900">ניהול משתמשים</h2>
        <p className="text-sm text-brown-500">
          הוספה, עריכה, השבתה ומחיקה של מנהלים בחשבון
        </p>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-cream-50">
              <tr className="text-brown-500">
                <th className="px-5 py-3 text-start font-medium">שם</th>
                <th className="px-5 py-3 text-start font-medium">דוא״ל</th>
                <th className="px-5 py-3 text-start font-medium">הרשאה</th>
                <th className="px-5 py-3 text-start font-medium">סטטוס</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-200">
              {managers.map((m) => {
                const isSelf = m.id === caller.id;
                return (
                  <tr key={m.id} className="hover:bg-cream-50">
                    <td className="px-5 py-3 font-medium text-brown-900">
                      {m.name}
                      {isSelf && (
                        <span className="ms-1 text-xs text-brown-400">
                          (את/ה)
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-brown-600" dir="ltr">
                      <span className="num">{m.email}</span>
                    </td>
                    <td className="px-5 py-3">
                      {m.isAdmin ? (
                        <Badge tone="success">מנהל-על</Badge>
                      ) : (
                        <Badge tone="neutral">מנהל</Badge>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {m.active ? (
                        <Badge tone="neutral">פעיל</Badge>
                      ) : (
                        <Badge tone="warning">מושבת</Badge>
                      )}
                    </td>
                    <td className="px-5 py-3 text-end">
                      <ManagerRowActions
                        id={m.id}
                        active={m.active}
                        isSelf={isSelf}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>הוספת מנהל/ת</CardTitle>
        </CardHeader>
        <CardBody>
          <form action={createManagerAction} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="name">שם מלא</Label>
                <Input id="name" name="name" required placeholder="לדוגמה: דנה כ." />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">דוא״ל לכניסה</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  dir="ltr"
                  className="text-start"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">סיסמה ראשונית</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                dir="ltr"
                className="text-start"
              />
              <p className="text-xs text-brown-500">
                8 תווים לפחות. המנהל/ת יוכל/תוכל לשנות בהמשך ב״הגדרות״.
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm text-brown-700">
              <input
                type="checkbox"
                name="isAdmin"
                className="h-4 w-4 rounded border-brown-400"
              />
              הרשאת מנהל-על (גישה לניהול משתמשים)
            </label>
            <div className="flex justify-end">
              <Button type="submit">הוסף מנהל/ת</Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
