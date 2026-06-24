import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  updateManagerAction,
  changeManagerPasswordAction,
} from "../actions";

export default async function EditManagerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");

  const caller = await prisma.manager.findUnique({
    where: { id: session.user.id },
  });
  if (!caller || !caller.active || !caller.isAdmin) redirect("/dashboard");

  const manager = await prisma.manager.findFirst({
    where: { id, restaurantId: caller.restaurantId },
  });
  if (!manager) notFound();

  const isSelf = manager.id === caller.id;
  const updateThis = updateManagerAction.bind(null, manager.id);
  const changePasswordThis = changeManagerPasswordAction.bind(null, manager.id);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/users"
            className="text-sm text-slate-500 hover:text-slate-700"
          >
            ← ניהול משתמשים
          </Link>
          <h2 className="mt-1 flex items-center gap-2 text-2xl font-extrabold text-slate-900">
            {manager.name}
            {manager.active ? (
              <Badge tone="neutral">פעיל</Badge>
            ) : (
              <Badge tone="warning">מושבת</Badge>
            )}
          </h2>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>פרטי המנהל/ת</CardTitle>
        </CardHeader>
        <CardBody>
          <form action={updateThis} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">שם מלא</Label>
              <Input id="name" name="name" defaultValue={manager.name} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">דוא״ל לכניסה</Label>
              <Input
                id="email"
                name="email"
                type="email"
                defaultValue={manager.email}
                required
                dir="ltr"
                className="text-start"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                name="isAdmin"
                defaultChecked={manager.isAdmin}
                className="h-4 w-4 rounded border-slate-300"
              />
              הרשאת מנהל-על (גישה לניהול משתמשים)
            </label>
            {isSelf && (
              <p className="rounded-lg border border-amber-200 bg-amber-50/60 p-2 text-xs text-amber-800">
                זהו החשבון שלך. הסרת הרשאת מנהל-על מעצמך עלולה לחסום את גישתך
                לעמוד זה.
              </p>
            )}
            <div className="flex justify-end">
              <Button type="submit">שמור שינויים</Button>
            </div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>איפוס סיסמה</CardTitle>
        </CardHeader>
        <CardBody>
          <form action={changePasswordThis} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="newPassword">סיסמה חדשה</Label>
              <Input
                id="newPassword"
                name="newPassword"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                dir="ltr"
                className="text-start"
              />
              <p className="text-xs text-slate-500">8 תווים לפחות</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword">אישור סיסמה חדשה</Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                autoComplete="new-password"
                dir="ltr"
                className="text-start"
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" variant="secondary">
                עדכן סיסמה
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
