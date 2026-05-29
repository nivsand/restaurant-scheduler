export function safeRedirectPath(value: unknown, fallback = "/dashboard") {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  if (value.startsWith("/api/auth")) return fallback;
  return value;
}

export function clearSessionPath(next = "/login") {
  const safeNext = safeRedirectPath(next, "/login");
  return `/api/auth/clear-session?next=${encodeURIComponent(safeNext)}`;
}
