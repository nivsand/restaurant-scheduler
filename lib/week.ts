import { prisma } from "@/lib/db";

// All weeks are Sunday-anchored at 00:00 local time.

export function sundayOf(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

export function nextSunday(date: Date): Date {
  const s = sundayOf(date);
  s.setDate(s.getDate() + 7);
  return s;
}

export function prevSunday(date: Date): Date {
  const s = sundayOf(date);
  s.setDate(s.getDate() - 7);
  return s;
}

// "Upcoming week" = the next Sunday if today is Fri/Sat, else current week's Sunday.
export function defaultActiveWeekStart(now = new Date()): Date {
  const dow = now.getDay();
  if (dow === 5 || dow === 6) return nextSunday(now);
  return sundayOf(now);
}

export function formatWeekRange(weekStart: Date): string {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  const fmt = new Intl.DateTimeFormat("he-IL", {
    day: "numeric",
    month: "numeric",
  });
  return `${fmt.format(weekStart)} – ${fmt.format(end)}`;
}

export function formatWeekStartShort(weekStart: Date): string {
  return new Intl.DateTimeFormat("he-IL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(weekStart);
}

export async function getOrCreateWeek(
  restaurantId: string,
  weekStart: Date,
): Promise<{ id: string; weekStart: Date; status: string }> {
  const normalized = sundayOf(weekStart);
  const existing = await prisma.week.findUnique({
    where: {
      restaurantId_weekStart: {
        restaurantId,
        weekStart: normalized,
      },
    },
  });
  if (existing) {
    return {
      id: existing.id,
      weekStart: existing.weekStart,
      status: existing.status,
    };
  }
  const created = await prisma.week.create({
    data: { restaurantId, weekStart: normalized, status: "draft" },
  });
  return {
    id: created.id,
    weekStart: created.weekStart,
    status: created.status,
  };
}

export function parseWeekStartParam(input: string | undefined | null): Date {
  if (!input) return defaultActiveWeekStart();
  const d = new Date(input);
  if (isNaN(d.getTime())) return defaultActiveWeekStart();
  return sundayOf(d);
}
