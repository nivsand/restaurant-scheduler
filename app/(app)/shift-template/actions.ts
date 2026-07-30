"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  ALL_SHIFT_TYPES,
  ShiftType,
  isShiftAllowedOnDay,
} from "@/lib/shifts";
import { DAYS, DayOfWeek } from "@/lib/days";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function saveTemplateAction(formData: FormData) {
  const { restaurantId } = await requireAuth();

  const rows: { day: DayOfWeek; shiftType: ShiftType; headcount: number }[] = [];

  for (const day of DAYS) {
    for (const shiftType of ALL_SHIFT_TYPES) {
      if (!isShiftAllowedOnDay(shiftType, day)) continue;
      const key = `cell-${day}-${shiftType}`;
      const raw = formData.get(key);
      if (raw == null) continue;
      const n = Number(raw);
      const headcount = Number.isFinite(n) && n >= 0 ? Math.min(20, Math.floor(n)) : 0;
      rows.push({ day, shiftType, headcount });
    }
  }

  // Hours: one start/end per shift type (not per day) — invalid or missing
  // values are skipped so the existing saved hours (or default) stand.
  const hoursRows: { shiftType: ShiftType; start: string; end: string; endsNextDay: boolean }[] = [];
  for (const shiftType of ALL_SHIFT_TYPES) {
    const start = String(formData.get(`hours-start-${shiftType}`) ?? "");
    const end = String(formData.get(`hours-end-${shiftType}`) ?? "");
    if (!TIME_RE.test(start) || !TIME_RE.test(end)) continue;
    // A shift that ends at/before its start time is assumed to cross midnight
    // (e.g. 16:00-01:00) rather than have zero/negative duration.
    hoursRows.push({ shiftType, start, end, endsNextDay: end <= start });
  }

  await prisma.$transaction([
    ...rows.map((r) =>
      prisma.shiftTemplate.upsert({
        where: {
          restaurantId_day_shiftType: {
            restaurantId,
            day: r.day,
            shiftType: r.shiftType,
          },
        },
        create: {
          restaurantId,
          day: r.day,
          shiftType: r.shiftType,
          headcount: r.headcount,
        },
        update: { headcount: r.headcount },
      }),
    ),
    ...hoursRows.map((r) =>
      prisma.shiftHours.upsert({
        where: {
          restaurantId_shiftType: { restaurantId, shiftType: r.shiftType },
        },
        create: {
          restaurantId,
          shiftType: r.shiftType,
          start: r.start,
          end: r.end,
          endsNextDay: r.endsNextDay,
        },
        update: { start: r.start, end: r.end, endsNextDay: r.endsNextDay },
      }),
    ),
  ]);

  revalidatePath("/shift-template");
  revalidatePath("/dashboard");
  revalidatePath("/schedule");
}

export async function saveRestaurantSettingsAction(formData: FormData) {
  const { restaurantId } = await requireAuth();

  const raw = Number(formData.get("minRestHours"));
  const minRestHours =
    Number.isFinite(raw) && raw >= 0 && raw <= 24 ? raw : 11;

  const defaultHoursText = String(formData.get("defaultHoursText") ?? "")
    .trim()
    .slice(0, 500);

  await prisma.restaurant.update({
    where: { id: restaurantId },
    data: { minRestHours, defaultHoursText },
  });
  revalidatePath("/shift-template");
  revalidatePath("/dashboard");
}
