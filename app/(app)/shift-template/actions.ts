"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  ALL_SHIFT_TYPES,
  ShiftType,
  isShiftAllowedOnDay,
} from "@/lib/shifts";
import { DAYS, DayOfWeek } from "@/lib/days";

export async function saveTemplateAction(formData: FormData) {
  const session = await auth();
  const restaurantId = session!.user.restaurantId;

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

  await prisma.$transaction(
    rows.map((r) =>
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
  );

  revalidatePath("/shift-template");
  revalidatePath("/dashboard");
}

export async function saveRestaurantSettingsAction(formData: FormData) {
  const session = await auth();
  const restaurantId = session!.user.restaurantId;

  const raw = Number(formData.get("minRestHours"));
  const minRestHours =
    Number.isFinite(raw) && raw >= 0 && raw <= 24 ? raw : 11;

  await prisma.restaurant.update({
    where: { id: restaurantId },
    data: { minRestHours },
  });
  revalidatePath("/shift-template");
  revalidatePath("/dashboard");
}
