import { getToken, type JWT } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionCookieName } from "@/lib/auth-cookies";
import { clearSessionPath } from "@/lib/auth-routes";

const PUBLIC_PATHS = [
  "/login",
  "/api/auth",
  "/a",             // public employee form lives at /a/[token]
  "/employee",      // employee login + availability (own auth)
  "/share",        // public schedule view by token
];

function hasValidToken(token: JWT | null) {
  return (
    typeof token?.id === "string" &&
    token.id.length > 0 &&
    typeof token.restaurantId === "string" &&
    token.restaurantId.length > 0
  );
}

function redirectToLogin(req: NextRequest) {
  const url = new URL("/login", req.nextUrl.origin);
  url.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export default async function middleware(req: NextRequest) {
  const { nextUrl } = req;
  const isPublic = PUBLIC_PATHS.some((p) => nextUrl.pathname.startsWith(p));
  if (isPublic) return NextResponse.next();

  const sessionCookieName = getSessionCookieName(req.cookies.getAll());
  if (!sessionCookieName) return redirectToLogin(req);

  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) {
    return NextResponse.redirect(new URL(clearSessionPath("/login"), nextUrl.origin));
  }

  const token = await getToken({
    req,
    secret,
    cookieName: sessionCookieName,
  });

  if (!hasValidToken(token)) {
    return NextResponse.redirect(new URL(clearSessionPath("/login"), nextUrl.origin));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
