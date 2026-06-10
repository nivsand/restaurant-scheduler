import { prisma } from "@/lib/db";

// All weeks are Sunday-anchored at 00:00 in the app timezone. Vercel runs in
// UTC, so week math must not depend on the server process timezone.

const APP_TIME_ZONE = process.env.APP_TIME_ZONE ?? "Asia/Jerusalem";

const zonedFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function zonedParts(date: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const parts = Object.fromEntries(
    zonedFormatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

function zonedMidnightToUtc(year: number, month: number, day: number): Date {
  const utcGuessMs = Date.UTC(year, month - 1, day, 0, 0, 0);
  const parts = zonedParts(new Date(utcGuessMs));
  const localAsUtcMs = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return new Date(utcGuessMs - (localAsUtcMs - utcGuessMs));
}

function calendarDateFromParts(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
}

export function sundayOf(date: Date): Date {
  const parts = zonedParts(date);
  const calendar = calendarDateFromParts(parts.year, parts.month, parts.day);
  calendar.setUTCDate(calendar.getUTCDate() - calendar.getUTCDay());
  return zonedMidnightToUtc(
    calendar.getUTCFullYear(),
    calendar.getUTCMonth() + 1,
    calendar.getUTCDate(),
  );
}

export function nextSunday(date: Date): Date {
  const parts = zonedParts(sundayOf(date));
  const calendar = calendarDateFromParts(parts.year, parts.month, parts.day);
  calendar.setUTCDate(calendar.getUTCDate() + 7);
  return zonedMidnightToUtc(
    calendar.getUTCFullYear(),
    calendar.getUTCMonth() + 1,
    calendar.getUTCDate(),
  );
}

export function prevSunday(date: Date): Date {
  const parts = zonedParts(sundayOf(date));
  const calendar = calendarDateFromParts(parts.year, parts.month, parts.day);
  calendar.setUTCDate(calendar.getUTCDate() - 7);
  return zonedMidnightToUtc(
    calendar.getUTCFullYear(),
    calendar.getUTCMonth() + 1,
    calendar.getUTCDate(),
  );
}

// Sun–Tue (dow 0-2): default to current calendar week.
// Wed–Sat (dow 3-6): default to next week.
export function defaultActiveWeekStart(now = new Date()): Date {
  const parts = zonedParts(now);
  const dow = calendarDateFromParts(parts.year, parts.month, parts.day).getUTCDay();
  if (dow >= 3) return nextSunday(now);
  return sundayOf(now);
}

export function formatWeekRange(weekStart: Date): string {
  const parts = zonedParts(weekStart);
  const endCalendar = calendarDateFromParts(parts.year, parts.month, parts.day);
  endCalendar.setUTCDate(endCalendar.getUTCDate() + 6);
  const end = zonedMidnightToUtc(
    endCalendar.getUTCFullYear(),
    endCalendar.getUTCMonth() + 1,
    endCalendar.getUTCDate(),
  );
  const fmt = new Intl.DateTimeFormat("he-IL", {
    day: "numeric",
    month: "numeric",
    timeZone: APP_TIME_ZONE,
  });
  return `${fmt.format(weekStart)} – ${fmt.format(end)}`;
}

export function formatWeekStartShort(weekStart: Date): string {
  return new Intl.DateTimeFormat("he-IL", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: APP_TIME_ZONE,
  }).format(weekStart);
}

export function formatWeekParam(weekStart: Date): string {
  const parts = zonedParts(sundayOf(weekStart));
  const month = String(parts.month).padStart(2, "0");
  const day = String(parts.day).padStart(2, "0");
  return `${parts.year}-${month}-${day}`;
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
  const dateOnly = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    return sundayOf(
      zonedMidnightToUtc(Number(year), Number(month), Number(day)),
    );
  }
  const d = new Date(input);
  if (isNaN(d.getTime())) return defaultActiveWeekStart();
  return sundayOf(d);
}
