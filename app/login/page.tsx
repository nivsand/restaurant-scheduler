import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { getToken } from "next-auth/jwt";
import { getSessionCookieName } from "@/lib/auth-cookies";
import { clearSessionPath, safeRedirectPath } from "@/lib/auth-routes";
import { prisma } from "@/lib/db";
import { loginAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; passwordChanged?: string }>;
}) {
  const sp = await searchParams;
  const cookieStore = await cookies();
  const next = safeRedirectPath(sp.next, "/dashboard");
  const sessionCookieName = getSessionCookieName(cookieStore.getAll());

  if (sessionCookieName) {
    const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
    const token = secret
      ? await getToken({
          req: { headers: await headers() },
          secret,
          cookieName: sessionCookieName,
        })
      : null;

    if (
      typeof token?.id !== "string" ||
      token.id.length === 0 ||
      typeof token?.restaurantId !== "string" ||
      token.restaurantId.length === 0
    ) {
      redirect(clearSessionPath("/login"));
    }

    const manager = await prisma.manager.findUnique({
      where: { id: token.id },
      select: { active: true, restaurantId: true },
    });

    if (manager?.active && manager.restaurantId === token.restaurantId) {
      redirect(next);
    }

    redirect(clearSessionPath("/login"));
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-navy p-6">
      <div className="pointer-events-none absolute -right-20 -top-[200px] h-[600px] w-[600px] rounded-full bg-brand-500/[0.12] blur-[80px]" />
      <div className="pointer-events-none absolute -bottom-[150px] -left-20 h-[400px] w-[400px] rounded-full bg-brand-500/[0.06] blur-[80px]" />

      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white p-10 shadow-2xl">
        <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-[14px] bg-gradient-to-br from-brand-500 to-brand-600 text-2xl text-white shadow-md shadow-brand-500/30">
          📋
        </div>
        <h1 className="text-2xl font-extrabold text-slate-900">סידור משמרות</h1>
        <p className="mt-1 text-sm text-slate-500">
          התחברות מנהל
        </p>

        <form action={loginAction} className="mt-8 space-y-4">
          <input type="hidden" name="next" value={next} />
          <div className="space-y-1.5">
            <Label htmlFor="email">דוא״ל</Label>
            <Input
              id="email"
              name="email"
              type="email"
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
          {sp.passwordChanged && !sp.error && (
            <p role="status" className="rounded-xl border border-brand-200 bg-brand-50/60 p-2.5 text-sm text-brand-700">
              הסיסמה שונתה בהצלחה. התחבר/י עם הסיסמה החדשה.
            </p>
          )}
          {sp.error && (
            <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-sm text-rose-600">
              דוא״ל או סיסמה שגויים
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
