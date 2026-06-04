"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatWeekParam, getOrCreateWeek, parseWeekStartParam } from "@/lib/week";
import { parseAvailability } from "@/lib/parser";
import { isShiftAllowedOnDay, SHIFT_DEFS, ShiftType } from "@/lib/shifts";
import { DayOfWeek } from "@/lib/days";

// ─── Navigate to a week (create-or-get) ────────────────────────────────────

export async function goToWeekAction(formData: FormData) {
  const session = await auth();
  const restaurantId = session!.user.restaurantId;
  const weekStartStr = String(formData.get("weekStart") ?? "");
  const ws = parseWeekStartParam(weekStartStr);
  await getOrCreateWeek(restaurantId, ws);
  redirect(`/availability?week=${encodeURIComponent(formatWeekParam(ws))}`);
}

// ─── Ingest a paste batch ──────────────────────────────────────────────────

const ingestBlockSchema = z.object({
  employeeId: z.string().min(1),
  content: z.string().min(1),
});

const ingestPayloadSchema = z.object({
  weekStart: z.string().min(1),
  blocks: z.array(ingestBlockSchema).min(1),
});

export async function ingestPasteAction(payloadJson: string): Promise<{
  weekId: string;
  created: number;
  warnings: string[];
}> {
  const session = await auth();
  const restaurantId = session!.user.restaurantId;

  const parsed = ingestPayloadSchema.safeParse(JSON.parse(payloadJson));
  if (!parsed.success) {
    throw new Error("בקשה לא תקינה");
  }
  const { weekStart, blocks } = parsed.data;
  const week = await getOrCreateWeek(
    restaurantId,
    parseWeekStartParam(weekStart),
  );

  let created = 0;
  const warnings: string[] = [];

  // Pre-fetch all tagged employees in one query
  const employeeIds = Array.from(new Set(blocks.map((b) => b.employeeId)));
  const employees = await prisma.employee.findMany({
    where: { id: { in: employeeIds }, restaurantId },
  });
  const empMap = new Map(employees.map((e) => [e.id, e]));

  for (const block of blocks) {
    const emp = empMap.get(block.employeeId);
    if (!emp) {
      warnings.push(`עובד לא נמצא: ${block.employeeId}`);
      continue;
    }

    // Persist raw submission first so we have a paper trail even if parsing fails.
    const submission = await prisma.rawSubmission.create({
      data: {
        weekId: week.id,
        employeeId: emp.id,
        content: block.content,
        source: "paste",
      },
    });

    let parseResult;
    try {
      parseResult = await parseAvailability(block.content, {
        employeeName: emp.name,
        role: emp.role as "kitchen" | "floor" | "both",
      });
    } catch (err) {
      warnings.push(`כשל בפענוח עבור ${emp.name}: ${(err as Error).message}`);
      continue;
    }

    // Persist requestedShifts onto the submission (engine will read it as a HARD cap).
    if (parseResult.requestedShifts != null) {
      await prisma.rawSubmission.update({
        where: { id: submission.id },
        data: { requestedShifts: parseResult.requestedShifts },
      });
    }

    // Clear any previous parsed rows for (week, employee) from previous pastes
    // — the latest submission supersedes older ones for the same employee.
    await prisma.parsedAvailability.deleteMany({
      where: {
        weekId: week.id,
        employeeId: emp.id,
        source: { in: ["rule", "llm"] }, // keep manual edits
      },
    });

    // Persist parsed rows.
    // confirmed = (confidence >= 0.6 OR source = form) — low-confidence rows
    // require manager confirmation before the scheduling engine will use them.
    const CONFIRM_THRESHOLD = 0.6;
    for (const row of parseResult.rows) {
      if (!isShiftAllowedOnDay(row.shiftType, row.day as DayOfWeek)) continue;
      const confirmed = row.confidence >= CONFIRM_THRESHOLD;
      try {
        await prisma.parsedAvailability.upsert({
          where: {
            weekId_employeeId_day_shiftType: {
              weekId: week.id,
              employeeId: emp.id,
              day: row.day,
              shiftType: row.shiftType,
            },
          },
          create: {
            weekId: week.id,
            employeeId: emp.id,
            day: row.day,
            shiftType: row.shiftType,
            available: row.available,
            confidence: row.confidence,
            note: row.note,
            source: row.source,
            confirmed,
          },
          update: {
            available: row.available,
            confidence: row.confidence,
            note: row.note,
            source: row.source,
            confirmed,
          },
        });
      } catch (err) {
        warnings.push(
          `שגיאה בשמירה עבור ${emp.name} (${row.day}/${row.shiftType}): ${(err as Error).message}`,
        );
      }
    }

    await prisma.rawSubmission.update({
      where: { id: submission.id },
      data: { parsedAt: new Date() },
    });

    if (parseResult.requestedShifts != null) {
      warnings.push(
        `${emp.name} ביקש/ה ${parseResult.requestedShifts} משמרות (יוחל כתקרה קשיחה)`,
      );
    }

    if (parseResult.warnings.length > 0) {
      warnings.push(
        ...parseResult.warnings.map((w) => `${emp.name}: ${w}`),
      );
    }
    created += 1;
  }

  revalidatePath("/availability");
  revalidatePath(`/availability/review/${week.id}`);
  return { weekId: week.id, created, warnings };
}

// ─── Manually toggle a cell on the review grid ─────────────────────────────

const toggleSchema = z.object({
  weekId: z.string(),
  employeeId: z.string(),
  day: z.number().int().min(0).max(6),
  shiftType: z.enum([
    "MORNING_KITCHEN",
    "MORNING_FLOOR",
    "EVENING_KITCHEN",
    "EVENING_FLOOR_17",
    "CLOSING_A_19",
    "CLOSING_B_20",
  ]),
  setAvailable: z.boolean(),
});

export async function toggleAvailabilityAction(payloadJson: string) {
  const session = await auth();
  const restaurantId = session!.user.restaurantId;

  const parsed = toggleSchema.safeParse(JSON.parse(payloadJson));
  if (!parsed.success) throw new Error("בקשה לא תקינה");
  const { weekId, employeeId, day, shiftType, setAvailable } = parsed.data;

  // Verify the week belongs to this restaurant
  const week = await prisma.week.findFirst({
    where: { id: weekId, restaurantId },
  });
  if (!week) throw new Error("שבוע לא נמצא");

  if (setAvailable) {
    // Role guard: kitchen employee cannot have a floor cell, and vice versa.
    const emp = await prisma.employee.findFirst({
      where: { id: employeeId, restaurantId },
    });
    if (!emp) throw new Error("עובד לא נמצא");
    const def = SHIFT_DEFS[shiftType as ShiftType];
    if (emp.role !== "both" && def.role !== emp.role) {
      throw new Error(
        `התפקיד של ${emp.name} לא תואם למשמרת זו (${def.role})`,
      );
    }

    await prisma.parsedAvailability.upsert({
      where: {
        weekId_employeeId_day_shiftType: {
          weekId,
          employeeId,
          day,
          shiftType,
        },
      },
      create: {
        weekId,
        employeeId,
        day,
        shiftType,
        available: true,
        confidence: 1.0,
        source: "manual",
        confirmed: true,
      },
      update: {
        available: true,
        confidence: 1.0,
        source: "manual",
        confirmed: true,
      },
    });
  } else {
    await prisma.parsedAvailability.deleteMany({
      where: { weekId, employeeId, day, shiftType },
    });
  }

  revalidatePath(`/availability/review/${weekId}`);
  revalidatePath("/availability");
}

// ─── Confirm low-confidence parsed rows for the engine to use ──────────────
// Granularity flows from the payload: weekId only = all in week; +employeeId =
// all for that employee; +day+shiftType = single cell.

const confirmSchema = z.object({
  weekId: z.string(),
  employeeId: z.string().optional(),
  day: z.number().int().min(0).max(6).optional(),
  shiftType: z.string().optional(),
});

export async function confirmAvailabilityAction(payloadJson: string) {
  const session = await auth();
  const restaurantId = session!.user.restaurantId;
  const parsed = confirmSchema.safeParse(JSON.parse(payloadJson));
  if (!parsed.success) throw new Error("בקשה לא תקינה");
  const { weekId, employeeId, day, shiftType } = parsed.data;

  const week = await prisma.week.findFirst({
    where: { id: weekId, restaurantId },
  });
  if (!week) throw new Error("שבוע לא נמצא");

  const where: Record<string, unknown> = { weekId, confirmed: false };
  if (employeeId) where.employeeId = employeeId;
  if (day !== undefined) where.day = day;
  if (shiftType) where.shiftType = shiftType;

  await prisma.parsedAvailability.updateMany({
    where,
    data: { confirmed: true },
  });

  revalidatePath(`/availability/review/${weekId}`);
}

// ─── Set requested-shifts for an employee on a given week ─────────────────
// Persists onto the most recent RawSubmission for that (week, employee), or
// creates a manager-source placeholder submission if none exists. The engine
// reads requestedShifts from the latest submission per employee.

const requestedSchema = z.object({
  weekId: z.string(),
  employeeId: z.string(),
  requestedShifts: z.number().int().min(0).max(14).nullable(),
});

export async function setRequestedShiftsAction(payloadJson: string) {
  const session = await auth();
  const restaurantId = session!.user.restaurantId;
  const parsed = requestedSchema.safeParse(JSON.parse(payloadJson));
  if (!parsed.success) throw new Error("בקשה לא תקינה");
  const { weekId, employeeId, requestedShifts } = parsed.data;

  const week = await prisma.week.findFirst({
    where: { id: weekId, restaurantId },
  });
  if (!week) throw new Error("שבוע לא נמצא");

  const emp = await prisma.employee.findFirst({
    where: { id: employeeId, restaurantId },
  });
  if (!emp) throw new Error("עובד לא נמצא");

  const latest = await prisma.rawSubmission.findFirst({
    where: { weekId, employeeId },
    orderBy: { submittedAt: "desc" },
  });

  if (latest) {
    await prisma.rawSubmission.update({
      where: { id: latest.id },
      data: { requestedShifts },
    });
  } else {
    await prisma.rawSubmission.create({
      data: {
        weekId,
        employeeId,
        content: `[ערך ע"י המנהל] משמרות מבוקשות: ${requestedShifts ?? "—"}`,
        source: "manual",
        requestedShifts,
        parsedAt: new Date(),
      },
    });
  }

  revalidatePath(`/availability/review/${weekId}`);
  revalidatePath(`/schedule/${weekId}`);
}

export async function unconfirmAvailabilityCellAction(payloadJson: string) {
  const session = await auth();
  const restaurantId = session!.user.restaurantId;
  const parsed = z
    .object({
      weekId: z.string(),
      employeeId: z.string(),
      day: z.number().int().min(0).max(6),
      shiftType: z.string(),
    })
    .safeParse(JSON.parse(payloadJson));
  if (!parsed.success) throw new Error("בקשה לא תקינה");

  const week = await prisma.week.findFirst({
    where: { id: parsed.data.weekId, restaurantId },
  });
  if (!week) throw new Error("שבוע לא נמצא");

  await prisma.parsedAvailability.updateMany({
    where: { ...parsed.data },
    data: { confirmed: false },
  });
  revalidatePath(`/availability/review/${parsed.data.weekId}`);
}

export async function deleteSubmissionAction(submissionId: string) {
  const session = await auth();
  const restaurantId = session!.user.restaurantId;
  const sub = await prisma.rawSubmission.findUnique({
    where: { id: submissionId },
    include: { week: true },
  });
  if (!sub || sub.week.restaurantId !== restaurantId) {
    throw new Error("הגשה לא נמצאה");
  }
  await prisma.rawSubmission.delete({ where: { id: submissionId } });
  if (sub.employeeId) {
    // Also drop the parsed rows derived from this submission's source flow.
    // Manual rows remain untouched.
    await prisma.parsedAvailability.deleteMany({
      where: {
        weekId: sub.weekId,
        employeeId: sub.employeeId,
        source: { in: ["rule", "llm", "form"] },
      },
    });
  }
  revalidatePath(`/availability/review/${sub.weekId}`);
  revalidatePath("/availability");
}
