"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { randomToken } from "@/lib/utils";

const employeeSchema = z.object({
  name: z.string().trim().min(1, "שם חובה"),
  role: z.enum(["kitchen", "floor", "both"]),
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
  const session = await auth();
  const restaurantId = session!.user.restaurantId;

  const raw = {
    name: formData.get("name"),
    role: formData.get("role"),
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

  await prisma.employee.create({
    data: {
      restaurantId,
      name: data.name,
      role: data.role,
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
  const session = await auth();
  const restaurantId = session!.user.restaurantId;

  const raw = {
    name: formData.get("name"),
    role: formData.get("role"),
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

  await prisma.employee.update({
    where: { id },
    data: {
      name: data.name,
      role: data.role,
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
  const session = await auth();
  const restaurantId = session!.user.restaurantId;
  const existing = await prisma.employee.findFirst({
    where: { id, restaurantId },
  });
  if (!existing) throw new Error("עובד לא נמצא");
  await prisma.employee.update({ where: { id }, data: { archived } });
  revalidatePath("/employees");
}

export async function regenerateTokenAction(id: string) {
  const session = await auth();
  const restaurantId = session!.user.restaurantId;
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
