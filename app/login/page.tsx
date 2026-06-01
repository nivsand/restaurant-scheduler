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
      typeof token.restaurantId !== "string" ||
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
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-xl ring-1 ring-slate-200">
        <h1 className="text-2xl font-bold text-slate-900">סידור משמרות</h1>
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
            <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-2 text-sm text-emerald-700">
              הסיסמה שונתה בהצלחה. התחבר/י עם הסיסמה החדשה.
            </p>
          )}
          {sp.error && (
            <p role="alert" className="text-sm text-rose-600">
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
