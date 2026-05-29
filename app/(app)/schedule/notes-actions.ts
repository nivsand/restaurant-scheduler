"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const noteSchema = z.object({
  weekId: z.string(),
  day: z.number().int().min(0).max(6),
  kind: z.enum(["event", "shift_manager", "hours"]),
  content: z.string().max(500),
});

export async function updateScheduleNoteAction(payloadJson: string) {
  const session = await auth();
  const restaurantId = session!.user.restaurantId;

  const parsed = noteSchema.safeParse(JSON.parse(payloadJson));
  if (!parsed.success) throw new Error("בקשה לא תקינה");
  const { weekId, day, kind, content } = parsed.data;

  const week = await prisma.week.findFirst({
    where: { id: weekId, restaurantId },
  });
  if (!week) throw new Error("שבוע לא נמצא");

  const trimmed = content.trim();
  if (trimmed === "") {
    await prisma.scheduleNote.deleteMany({
      where: { weekId, day, kind },
    });
  } else {
    await prisma.scheduleNote.upsert({
      where: { weekId_day_kind: { weekId, day, kind } },
      create: { weekId, day, kind, content: trimmed },
      update: { content: trimmed },
    });
  }

  revalidatePath(`/schedule/${weekId}`);
  revalidatePath(`/schedule/${weekId}/print`);
}
