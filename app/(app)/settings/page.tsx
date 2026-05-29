import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateProfileAction, changePasswordAction } from "./actions";

export default async function SettingsPage() {
  const session = await auth();
  const manager = await prisma.manager.findUniqueOrThrow({
    where: { id: session!.user.id },
  });

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">הגדרות</h2>
        <p className="text-sm text-slate-500">ניהול חשבון המנהל/ת</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>פרטים אישיים</CardTitle>
        </CardHeader>
        <CardBody>
          <form action={updateProfileAction} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">שם מלא</Label>
              <Input
                id="name"
                name="name"
                defaultValue={manager.name}
                required
                placeholder="לדוגמה: ניב ש."
              />
              <p className="text-xs text-slate-500">
                יוצג בדאשבורד ובהיסטוריית פעולות
              </p>
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
            <div className="flex justify-end">
              <Button type="submit">שמור שינויים</Button>
            </div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>החלפת סיסמה</CardTitle>
        </CardHeader>
        <CardBody>
          <form action={changePasswordAction} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="currentPassword">סיסמה נוכחית</Label>
              <Input
                id="currentPassword"
                name="currentPassword"
                type="password"
                required
                autoComplete="current-password"
                dir="ltr"
                className="text-start"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="newPassword">סיסמה חדשה</Label>
              <Input
                id="newPassword"
                name="newPassword"
                type="password"
                required
                autoComplete="new-password"
                minLength={8}
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
            <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-2 text-xs text-amber-800">
              לאחר שינוי הסיסמה תתבצע התנתקות אוטומטית. תידרש להיכנס מחדש.
            </div>
            <div className="flex justify-end">
              <Button type="submit" variant="secondary">
                שנה סיסמה
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
