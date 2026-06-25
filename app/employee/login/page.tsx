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
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-warm-50 p-6" dir="rtl">
      <div className="pointer-events-none absolute -right-20 -top-[200px] h-[600px] w-[600px] rounded-full bg-brand-400/[0.08] blur-[80px]" />
      <div className="pointer-events-none absolute -bottom-[150px] -left-20 h-[400px] w-[400px] rounded-full bg-terracotta/[0.06] blur-[80px]" />

      <div className="relative z-10 w-full max-w-md rounded-2xl border border-cream-200 bg-white p-10 shadow-warm-lg">
        <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-[14px] bg-gradient-to-br from-brand-500 to-terracotta text-2xl text-white shadow-md shadow-brand-500/30">
          ✏️
        </div>
        <h1 className="text-2xl font-extrabold text-brown-900">הגשת זמינות</h1>
        <p className="mt-1 text-sm text-brown-500">התחברות עובד</p>

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
            <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-sm text-rose-600">
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
