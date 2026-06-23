"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { randomToken } from "@/lib/utils";

const employeeSchema = z.object({
  name: z.string().trim().min(1, "שם חובה"),
  role: z.enum(["kitchen", "floor", "both"]),
  email: z.string().trim().toLowerCase().max(120).optional().nullable(),
  maxShifts: z.coerce.number().int().min(0).max(14).optional().nullable(),
  minShifts: z.coerce.number().int().min(0).max(14).optional().nullable(),
  onlyMornings: z.coerce.boolean().optional().default(false),
  onlyEvenings: z.coerce.boolean().optional().default(false),
  noClosings: z.coerce.boolean().optional().default(false),
  weekendOk: z.coerce.boolean().optional().default(true),
  notes: z.string().trim().optional().nullable(),
});

function parseFormBooleans(formData: FormData): Record<string, boolean> {
  return {
    onlyMornings: formData.get("onlyMornings") === "on",
    onlyEvenings: formData.get("onlyEvenings") === "on",
    noClosings: formData.get("noClosings") === "on",
    weekendOk: formData.get("weekendOk") === "on",
  };
}

export async function createEmployeeAction(formData: FormData) {
  const { restaurantId } = await requireAuth();

  const raw = {
    name: formData.get("name"),
    role: formData.get("role"),
    email: formData.get("email") || null,
    maxShifts: formData.get("maxShifts") || null,
    minShifts: formData.get("minShifts") || null,
    notes: formData.get("notes") || null,
    ...parseFormBooleans(formData),
  };
  const parsed = employeeSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(parsed.error.errors.map((e) => e.message).join(", "));
  }
  const data = parsed.data;

  if (data.onlyMornings && data.onlyEvenings) {
    throw new Error("לא ניתן לסמן גם 'רק בקרים' וגם 'רק ערבים'");
  }

  const emailVal = data.email || null;
  if (emailVal) {
    const dup = await prisma.employee.findFirst({
      where: { restaurantId, email: emailVal },
    });
    if (dup) throw new Error("אימייל כבר בשימוש על ידי עובד אחר");
  }

  await prisma.employee.create({
    data: {
      restaurantId,
      name: data.name,
      role: data.role,
      email: emailVal,
      maxShifts: data.maxShifts,
      minShifts: data.minShifts,
      onlyMornings: data.onlyMornings,
      onlyEvenings: data.onlyEvenings,
      noClosings: data.noClosings,
      weekendOk: data.weekendOk,
      notes: data.notes ?? null,
      submissionToken: randomToken(),
    },
  });

  revalidatePath("/employees");
  redirect("/employees");
}

export async function updateEmployeeAction(id: string, formData: FormData) {
  const { restaurantId } = await requireAuth();

  const raw = {
    name: formData.get("name"),
    role: formData.get("role"),
    email: formData.get("email") || null,
    maxShifts: formData.get("maxShifts") || null,
    minShifts: formData.get("minShifts") || null,
    notes: formData.get("notes") || null,
    ...parseFormBooleans(formData),
  };
  const parsed = employeeSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(parsed.error.errors.map((e) => e.message).join(", "));
  }
  const data = parsed.data;

  if (data.onlyMornings && data.onlyEvenings) {
    throw new Error("לא ניתן לסמן גם 'רק בקרים' וגם 'רק ערבים'");
  }

  const existing = await prisma.employee.findFirst({
    where: { id, restaurantId },
  });
  if (!existing) throw new Error("עובד לא נמצא");

  const emailVal = data.email || null;
  if (emailVal && emailVal !== existing.email) {
    const dup = await prisma.employee.findFirst({
      where: { restaurantId, email: emailVal, id: { not: id } },
    });
    if (dup) throw new Error("אימייל כבר בשימוש על ידי עובד אחר");
  }

  await prisma.employee.update({
    where: { id },
    data: {
      name: data.name,
      role: data.role,
      email: emailVal,
      maxShifts: data.maxShifts,
      minShifts: data.minShifts,
      onlyMornings: data.onlyMornings,
      onlyEvenings: data.onlyEvenings,
      noClosings: data.noClosings,
      weekendOk: data.weekendOk,
      notes: data.notes ?? null,
    },
  });

  revalidatePath("/employees");
  revalidatePath(`/employees/${id}`);
  redirect("/employees");
}

export async function setArchivedAction(id: string, archived: boolean) {
  const { restaurantId } = await requireAuth();
  const existing = await prisma.employee.findFirst({
    where: { id, restaurantId },
  });
  if (!existing) throw new Error("עובד לא נמצא");
  await prisma.employee.update({ where: { id }, data: { archived } });
  revalidatePath("/employees");
}

export async function regenerateTokenAction(id: string) {
  const { restaurantId } = await requireAuth();
  const existing = await prisma.employee.findFirst({
    where: { id, restaurantId },
  });
  if (!existing) throw new Error("עובד לא נמצא");
  await prisma.employee.update({
    where: { id },
    data: { submissionToken: randomToken() },
  });
  revalidatePath(`/employees/${id}`);
}

const passwordSchema = z.object({
  employeeId: z.string().min(1),
  password: z.string().min(4, "סיסמה חייבת להכיל לפחות 4 תווים"),
});

export async function setEmployeePasswordAction(payloadJson: string) {
  const { restaurantId } = await requireAuth();
  const parsed = passwordSchema.safeParse(JSON.parse(payloadJson));
  if (!parsed.success) {
    throw new Error(parsed.error.errors.map((e) => e.message).join(", "));
  }

  const existing = await prisma.employee.findFirst({
    where: { id: parsed.data.employeeId, restaurantId },
  });
  if (!existing) throw new Error("עובד לא נמצא");
  if (!existing.email) throw new Error("יש להגדיר אימייל לפני הגדרת סיסמה");

  const hash = await bcrypt.hash(parsed.data.password, 10);
  await prisma.employee.update({
    where: { id: parsed.data.employeeId },
    data: { passwordHash: hash },
  });

  revalidatePath(`/employees/${parsed.data.employeeId}`);
}

export async function clearEmployeePasswordAction(employeeId: string) {
  const { restaurantId } = await requireAuth();
  const existing = await prisma.employee.findFirst({
    where: { id: employeeId, restaurantId },
  });
  if (!existing) throw new Error("עובד לא נמצא");

  await prisma.employee.update({
    where: { id: employeeId },
    data: { passwordHash: null },
  });

  revalidatePath(`/employees/${employeeId}`);
}
