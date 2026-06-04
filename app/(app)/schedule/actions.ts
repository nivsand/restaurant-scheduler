"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { loadEngineInput } from "@/lib/engine/load";
import { checkEligibility } from "@/lib/engine/candidates";
import { ShiftType } from "@/lib/shifts";
import { DayOfWeek } from "@/lib/days";
import { AssignmentState, slotKey } from "@/lib/engine/types";
import { runEngineMultiTrial } from "@/lib/engine/run";

// ─── Generate / regenerate ─────────────────────────────────────────────────

const generateSchema = z.object({
  weekId: z.string(),
  // Optional explicit seed. If absent, deterministic from weekId.
  // Pass "shuffle:<unix>" to force a new random seed (UI does this).
  seed: z.union([z.number(), z.string()]).optional(),
});

async function authedWeek(weekId: string) {
  const session = await auth();
  const restaurantId = session!.user.restaurantId;
  const week = await prisma.week.findFirst({
    where: { id: weekId, restaurantId },
  });
  if (!week) throw new Error("שבוע לא נמצא");
  return { week, restaurantId, managerId: session!.user.id };
}

export async function generateScheduleAction(payloadJson: string) {
  const parsed = generateSchema.safeParse(JSON.parse(payloadJson));
  if (!parsed.success) throw new Error("בקשה לא תקינה");
  const { weekId, seed } = parsed.data;
  const { managerId } = await authedWeek(weekId);

  const isShuffle = typeof seed === "string" && seed.startsWith("shuffle:");
  const numericSeed =
    typeof seed === "number"
      ? seed
      : isShuffle
        ? Math.floor(Date.now() / 1000) ^ Math.floor(Math.random() * 0xffffffff)
        : undefined;

  const input = await loadEngineInput(weekId, numericSeed);
  // Every generation runs multiple candidates and keeps the best. Empty slots
  // are ranked first, then the ordinary fairness/preference score.
  const trials = isShuffle ? 48 : 24;
  const output = runEngineMultiTrial(input, trials);

  // Persist: delete non-locked assignments + insert new ones
  await prisma.$transaction(async (tx) => {
    await tx.scheduleAssignment.deleteMany({
      where: { weekId, locked: false },
    });
    for (const a of output.assignments) {
      if (a.locked) continue; // locked already exist, skip
      await tx.scheduleAssignment.upsert({
        where: {
          weekId_day_shiftType_slotIndex: {
            weekId,
            day: a.day,
            shiftType: a.shiftType,
            slotIndex: a.slotIndex,
          },
        },
        create: {
          weekId,
          day: a.day,
          shiftType: a.shiftType,
          slotIndex: a.slotIndex,
          employeeId: a.employeeId,
          locked: false,
          generatedScore: a.score,
          generatedBreakdown: JSON.stringify(a.breakdown),
          generatedAt: new Date(),
        },
        update: {
          employeeId: a.employeeId,
          generatedScore: a.score,
          generatedBreakdown: JSON.stringify(a.breakdown),
          generatedAt: new Date(),
        },
      });
    }
    // Audit
    await tx.auditLog.create({
      data: {
        weekId,
        managerId,
        action: "generate_schedule",
        payload: JSON.stringify({
          seed: output.seed,
          assignmentCount: output.assignments.length,
          emptyCount: output.emptySlots.length,
          trials: output.trials,
          warningCount: output.warnings.length,
          durationMs: output.durationMs,
        }),
      },
    });
  });

  revalidatePath(`/schedule/${weekId}`);
  revalidatePath("/schedule");
  revalidatePath("/dashboard");
  return {
    seed: output.seed,
    assignments: output.assignments.length,
    emptySlots: output.emptySlots.length,
    trials: output.trials,
    warnings: output.warnings.length,
    durationMs: output.durationMs,
  };
}

// ─── Set lock on a slot ────────────────────────────────────────────────────

const lockSchema = z.object({
  weekId: z.string(),
  day: z.number().int().min(0).max(6),
  shiftType: z.string(),
  slotIndex: z.number().int().min(0),
  locked: z.boolean(),
});

export async function setLockAction(payloadJson: string) {
  const parsed = lockSchema.safeParse(JSON.parse(payloadJson));
  if (!parsed.success) throw new Error("בקשה לא תקינה");
  const { weekId, day, shiftType, slotIndex, locked } = parsed.data;
  await authedWeek(weekId);

  await prisma.scheduleAssignment.updateMany({
    where: { weekId, day, shiftType, slotIndex },
    data: { locked },
  });
  revalidatePath(`/schedule/${weekId}`);
}

// ─── Manual reassign ───────────────────────────────────────────────────────

const reassignSchema = z.object({
  weekId: z.string(),
  day: z.number().int().min(0).max(6),
  shiftType: z.string(),
  slotIndex: z.number().int().min(0),
  employeeId: z.string().nullable(),
});

export async function reassignSlotAction(payloadJson: string) {
  const parsed = reassignSchema.safeParse(JSON.parse(payloadJson));
  if (!parsed.success) throw new Error("בקשה לא תקינה");
  const { weekId, day, shiftType, slotIndex, employeeId } = parsed.data;
  const { managerId } = await authedWeek(weekId);

  await prisma.scheduleAssignment.upsert({
    where: {
      weekId_day_shiftType_slotIndex: { weekId, day, shiftType, slotIndex },
    },
    create: {
      weekId,
      day,
      shiftType,
      slotIndex,
      employeeId,
      locked: true,
      generatedScore: null,
      generatedBreakdown: null,
    },
    update: {
      employeeId,
      locked: true,
      generatedScore: null,
      generatedBreakdown: null,
    },
  });

  await prisma.auditLog.create({
    data: {
      weekId,
      managerId,
      action: "reassign_slot",
      payload: JSON.stringify({ day, shiftType, slotIndex, employeeId }),
    },
  });

  revalidatePath(`/schedule/${weekId}`);
}

// ─── Approve schedule ─────────────────────────────────────────────────────

export async function approveScheduleAction(weekId: string) {
  const { managerId } = await authedWeek(weekId);
  await prisma.week.update({
    where: { id: weekId },
    data: { status: "approved", approvedAt: new Date() },
  });
  await prisma.auditLog.create({
    data: {
      weekId,
      managerId,
      action: "approve_schedule",
      payload: "{}",
    },
  });
  revalidatePath(`/schedule/${weekId}`);
  revalidatePath("/schedule");
}

export async function reopenScheduleAction(weekId: string) {
  const { managerId } = await authedWeek(weekId);
  await prisma.week.update({
    where: { id: weekId },
    data: { status: "draft", approvedAt: null },
  });
  await prisma.auditLog.create({
    data: {
      weekId,
      managerId,
      action: "reopen_schedule",
      payload: "{}",
    },
  });
  revalidatePath(`/schedule/${weekId}`);
}

// ─── "Why isn't X here?" — explain a slot's eligibility for every employee ─

export interface SlotExplanation {
  day: DayOfWeek;
  shiftType: ShiftType;
  slotIndex: number;
  rows: Array<{
    employeeId: string;
    employeeName: string;
    role: string;
    eligible: boolean;
    confidence?: number;
    reason?: string;
    severity?: "hard" | "soft"; // present when eligible=false
    currentAssignments: number;
  }>;
}

const explainSchema = z.object({
  weekId: z.string(),
  day: z.number().int().min(0).max(6),
  shiftType: z.string(),
  slotIndex: z.number().int().min(0),
});

export async function explainSlotAction(
  payloadJson: string,
): Promise<SlotExplanation> {
  const parsed = explainSchema.safeParse(JSON.parse(payloadJson));
  if (!parsed.success) throw new Error("בקשה לא תקינה");
  const { weekId, day, shiftType, slotIndex } = parsed.data;
  await authedWeek(weekId);

  const input = await loadEngineInput(weekId);

  // Build the current assignment state (NOT just locked — full current state)
  const allAssignments = await prisma.scheduleAssignment.findMany({
    where: { weekId, employeeId: { not: null } },
  });
  const state: AssignmentState = { byEmployee: new Map(), bySlot: new Map() };
  for (const a of allAssignments) {
    if (!a.employeeId) continue;
    // Skip this slot itself so we evaluate "could employee X go HERE?"
    if (
      a.day === day &&
      a.shiftType === shiftType &&
      a.slotIndex === slotIndex
    ) {
      continue;
    }
    const decision = {
      day: a.day as DayOfWeek,
      shiftType: a.shiftType as ShiftType,
      slotIndex: a.slotIndex,
      employeeId: a.employeeId,
      locked: a.locked,
      score: a.generatedScore ?? 0,
      breakdown: [],
      alternatives: [],
    };
    const arr = state.byEmployee.get(a.employeeId) ?? [];
    arr.push(decision);
    state.byEmployee.set(a.employeeId, arr);
    state.bySlot.set(slotKey(a), decision);
  }

  const slot = input.slots.find(
    (s) =>
      s.day === day && s.shiftType === shiftType && s.slotIndex === slotIndex,
  );
  if (!slot) throw new Error("משבצת לא נמצאה");

  const rows = input.employees.map((emp) => {
    const r = checkEligibility(
      emp,
      slot,
      input.availability,
      state,
      input.weekStart,
      input.restaurant.minRestHours,
      input.restaurant.maxConsecutiveDays,
      input.blocks,
    );
    return {
      employeeId: emp.id,
      employeeName: emp.name,
      role: emp.role,
      eligible: r.eligible,
      confidence: r.eligible ? r.confidence : undefined,
      reason: r.eligible ? undefined : r.reason,
      severity: r.eligible ? undefined : r.severity,
      currentAssignments: state.byEmployee.get(emp.id)?.length ?? 0,
    };
  });

  return {
    day: slot.day,
    shiftType: slot.shiftType,
    slotIndex: slot.slotIndex,
    rows,
  };
}

// ─── Block / unblock an employee from a specific shift ─────────────────────

const blockSchema = z.object({
  weekId: z.string(),
  day: z.number().int().min(0).max(6),
  shiftType: z.string(),
  employeeId: z.string(),
});

export async function blockEmployeeAction(payloadJson: string) {
  const parsed = blockSchema.safeParse(JSON.parse(payloadJson));
  if (!parsed.success) throw new Error("בקשה לא תקינה");
  const { weekId, day, shiftType, employeeId } = parsed.data;
  const { managerId } = await authedWeek(weekId);

  await prisma.scheduleBlock.upsert({
    where: {
      weekId_day_shiftType_employeeId: { weekId, day, shiftType, employeeId },
    },
    create: { weekId, day, shiftType, employeeId },
    update: {},
  });

  // If the employee is currently assigned to ANY slot in this shift, free it
  // — the manager-defined block is a hard constraint.
  await prisma.scheduleAssignment.updateMany({
    where: { weekId, day, shiftType, employeeId, locked: false },
    data: { employeeId: null },
  });

  await prisma.auditLog.create({
    data: {
      weekId,
      managerId,
      action: "block_employee",
      payload: JSON.stringify({ day, shiftType, employeeId }),
    },
  });

  revalidatePath(`/schedule/${weekId}`);
}

export async function unblockEmployeeAction(payloadJson: string) {
  const parsed = blockSchema.safeParse(JSON.parse(payloadJson));
  if (!parsed.success) throw new Error("בקשה לא תקינה");
  const { weekId, day, shiftType, employeeId } = parsed.data;
  const { managerId } = await authedWeek(weekId);

  await prisma.scheduleBlock.deleteMany({
    where: { weekId, day, shiftType, employeeId },
  });

  await prisma.auditLog.create({
    data: {
      weekId,
      managerId,
      action: "unblock_employee",
      payload: JSON.stringify({ day, shiftType, employeeId }),
    },
  });

  revalidatePath(`/schedule/${weekId}`);
}

// Used by the schedule page to render the "blocked" list per cell
export async function listBlocksAction(weekId: string): Promise<
  Array<{ day: number; shiftType: string; employeeId: string; employeeName: string }>
> {
  await authedWeek(weekId);
  const blocks = await prisma.scheduleBlock.findMany({
    where: { weekId },
    include: { employee: { select: { name: true } } },
  });
  return blocks.map((b) => ({
    day: b.day,
    shiftType: b.shiftType,
    employeeId: b.employeeId,
    employeeName: b.employee.name,
  }));
}
