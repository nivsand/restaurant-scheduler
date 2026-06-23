import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyEmployeeToken, COOKIE_NAME } from "@/lib/employee-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { employeeLoginAction } from "./actions";

export default async function EmployeeLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;

  // Already logged in? Redirect to form.
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (token) {
    const payload = await verifyEmployeeToken(token);
    if (payload) redirect("/employee");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6" dir="rtl">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-xl ring-1 ring-slate-200">
        <h1 className="text-2xl font-bold text-slate-900">הגשת זמינות</h1>
        <p className="mt-1 text-sm text-slate-500">התחברות עובד</p>

        <form action={employeeLoginAction} className="mt-8 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">אימייל / שם משתמש</Label>
            <Input
              id="email"
              name="email"
              type="text"
              required
              autoComplete="email"
              dir="ltr"
              className="text-start"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">סיסמה</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              dir="ltr"
              className="text-start"
            />
          </div>
          {sp.error && (
            <p role="alert" className="text-sm text-rose-600">
              פרטי התחברות שגויים
            </p>
          )}
          <Button type="submit" className="w-full" size="lg">
            התחבר
          </Button>
        </form>
      </div>
    </main>
  );
}
