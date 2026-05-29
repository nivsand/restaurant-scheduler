const AUTH_COOKIE_PREFIXES = [
  "authjs.",
  "__Secure-authjs.",
  "__Host-authjs.",
  "next-auth.",
  "__Secure-next-auth.",
  "__Host-next-auth.",
];

export function isAuthCookie(name: string) {
  return AUTH_COOKIE_PREFIXES.some((prefix) => name.startsWith(prefix));
}

export function isSessionCookie(name: string) {
  return isAuthCookie(name) && name.includes("session-token");
}

export function hasSessionCookie(cookies: Iterable<{ name: string }>) {
  for (const cookie of cookies) {
    if (isSessionCookie(cookie.name)) return true;
  }
  return false;
}

export function getSessionCookieName(cookies: Iterable<{ name: string }>) {
  for (const cookie of cookies) {
    if (isSessionCookie(cookie.name)) return cookie.name.replace(/\.\d+$/, "");
  }
  return null;
}
