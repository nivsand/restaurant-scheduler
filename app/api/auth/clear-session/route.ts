import { NextRequest, NextResponse } from "next/server";
import { isAuthCookie } from "@/lib/auth-cookies";
import { safeRedirectPath } from "@/lib/auth-routes";

export function GET(request: NextRequest) {
  const next = safeRedirectPath(request.nextUrl.searchParams.get("next"), "/login");
  const response = NextResponse.redirect(new URL(next, request.url));

  for (const cookie of request.cookies.getAll()) {
    if (!isAuthCookie(cookie.name)) continue;
    response.cookies.set(cookie.name, "", {
      expires: new Date(0),
      maxAge: 0,
      path: "/",
    });
  }

  response.headers.set("Cache-Control", "no-store");
  return response;
}
