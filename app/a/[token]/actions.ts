"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getOrCreateWeek, parseWeekStartParam } from "@/lib/week";
import { isShiftAllowedOnDay, SHIFT_DEFS, ShiftType } from "@/lib/shifts";
import { DAY_NAMES_HE, DAYS, DayOfWeek } from "@/lib/days";

// Renders form-submitted cells as readable Hebrew, grouped by day. Used for
// the RawSubmission.content field so the manager review page shows something
// readable instead of "0:MORNING_FLOOR, 1:CLOSING_A_19, ...".
function formatFormContent(
  cells: Array<{ day: number; shiftType: string }>,
  note: string,
): string {
  const byDay = new Map<number, string[]>();
  for (const c of cells) {
    const def = SHIFT_DEFS[c.shiftType as ShiftType];
    if (!def) continue;
    const arr = byDay.get(c.day) ?? [];
    arr.push(def.labelHe);
    byDay.set(c.day, arr);
  }
  const lines: string[] = [];
  for (const d of DAYS) {
    const day = d as DayOfWeek;
    if (!byDay.has(day)) continue;
    lines.push(`${DAY_NAMES_HE[day]}: ${byDay.get(day)!.join(", ")}`);
  }
  if (note && note.trim()) lines.push(`הערה: ${note.trim()}`);
  return lines.join("\n");
}

const cellSchema = z.object({
  day: z.number().int().min(0).max(6),
  shiftType: z.enum([
    "MORNING_KITCHEN",
    "MORNING_FLOOR",
    "EVENING_KITCHEN",
    "EVENING_FLOOR_17",
    "CLOSING_A_19",
    "CLOSING_B_20",
  ]),
});

const formPayloadSchema = z.object({
  token: z.string().min(1),
  weekStart: z.string().min(1),
  cells: z.array(cellSchema),
  note: z.string().optional().default(""),
});

export async function submitAvailabilityForm(payloadJson: string): Promise<{
  ok: true;
  submissionId: string;
  redirectTo: string;
}> {
  const parsed = formPayloadSchema.safeParse(JSON.parse(payloadJson));
  if (!parsed.success) {
    throw new Error("בקשה לא תקינה");
  }
  const { token, weekStart, cells, note } = parsed.data;

  const employee = await prisma.employee.findUnique({
    where: { submissionToken: token },
  });
  if (!employee) throw new Error("קישור לא תקין");
  if (employee.archived) throw new Error("חשבון לא פעיל");

  const week = await getOrCreateWeek(
    employee.restaurantId,
    parseWeekStartParam(weekStart),
  );

  // Hard stop: once the schedule is approved, employees cannot resubmit.
  // This protects against changes after the manager has already posted/sent
  // the schedule to staff.
  if (week.status === "approved") {
    throw new Error(
      "הסידור לשבוע זה כבר אושר. אם יש שינוי בזמינות, פנו ישירות למנהל/ת.",
    );
  }

  // Persist raw submission with human-readable Hebrew content
  const submission = await prisma.rawSubmission.create({
    data: {
      weekId: week.id,
      employeeId: employee.id,
      content: formatFormContent(cells, note),
      source: "form",
      parsedAt: new Date(),
    },
  });

  // Replace this employee's form-source parsed rows. Manual edits remain.
  await prisma.parsedAvailability.deleteMany({
    where: {
      weekId: week.id,
      employeeId: employee.id,
      source: { in: ["rule", "llm", "form"] },
    },
  });

  let droppedRoleMismatch = 0;
  for (const cell of cells) {
    if (!isShiftAllowedOnDay(cell.shiftType, cell.day as 0 | 1 | 2 | 3 | 4 | 5 | 6))
      continue;
    // Server-side role filter: kitchen employee cannot have a floor cell, and
    // vice versa. "both" passes through. Defensive against client tampering.
    const def = SHIFT_DEFS[cell.shiftType as ShiftType];
    if (employee.role !== "both" && def.role !== employee.role) {
      droppedRoleMismatch += 1;
      continue;
    }
    await prisma.parsedAvailability.upsert({
      where: {
        weekId_employeeId_day_shiftType: {
          weekId: week.id,
          employeeId: employee.id,
          day: cell.day,
          shiftType: cell.shiftType,
        },
      },
      create: {
        weekId: week.id,
        employeeId: employee.id,
        day: cell.day,
        shiftType: cell.shiftType,
        available: true,
        confidence: 1.0,
        source: "form",
        note: note || null,
        confirmed: true,
      },
      update: {
        available: true,
        confidence: 1.0,
        source: "form",
        note: note || null,
        confirmed: true,
      },
    });
  }

  // Annotate the raw submission if we dropped any cells
  if (droppedRoleMismatch > 0) {
    await prisma.rawSubmission.update({
      where: { id: submission.id },
      data: {
        content:
          submission.content +
          `\n[נדחה שרת] ${droppedRoleMismatch} משבצות לא תאמו לתפקיד`,
      },
    });
  }

  revalidatePath(`/a/${token}`);
  revalidatePath(`/availability`);
  // CRITICAL: revalidate the per-week review page so the manager sees the
  // submission immediately. Without this, the SSR page may render stale data.
  revalidatePath(`/availability/review/${week.id}`);
  return {
    ok: true,
    submissionId: submission.id,
    redirectTo: `/a/${token}/success?submission=${submission.id}`,
  };
}
