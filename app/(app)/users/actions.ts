"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// ─── Admin guard ────────────────────────────────────────────────────────────
// Every action in this file is restricted to active admins. We re-check the DB
// (not just the session) so a demoted/disabled admin can't keep acting.
async function requireAdmin() {
  const session = await auth();
  if (!session?.user) throw new Error("לא מחובר");
  const caller = await prisma.manager.findUnique({
    where: { id: session.user.id },
  });
  if (!caller || !caller.active || !caller.isAdmin) {
    throw new Error("נדרשת הרשאת מנהל-על");
  }
  return { callerId: caller.id, restaurantId: caller.restaurantId };
}

// Throws if the action would leave the restaurant without an active admin.
async function assertNotLastActiveAdmin(
  restaurantId: string,
  targetId: string,
) {
  const target = await prisma.manager.findFirst({
    where: { id: targetId, restaurantId },
  });
  if (!target) throw new Error("המשתמש לא נמצא");
  if (!target.isAdmin || !target.active) return; // removing a non-admin is fine
  const otherActiveAdmins = await prisma.manager.count({
    where: {
      restaurantId,
      isAdmin: true,
      active: true,
      id: { not: targetId },
    },
  });
  if (otherActiveAdmins === 0) {
    throw new Error("לא ניתן — זהו מנהל-העל הפעיל האחרון");
  }
}

// ─── Create ──────────────────────────────────────────────────────────────────
const createSchema = z.object({
  name: z.string().trim().min(1, "שם חובה").max(60),
  email: z.string().trim().toLowerCase().email("כתובת לא תקינה"),
  password: z.string().min(8, "סיסמה: 8 תווים לפחות"),
  isAdmin: z.boolean().default(false),
});

export async function createManagerAction(formData: FormData) {
  const { restaurantId } = await requireAdmin();

  const parsed = createSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    isAdmin: formData.get("isAdmin") === "on",
  });
  if (!parsed.success) {
    throw new Error(parsed.error.errors.map((e) => e.message).join(", "));
  }
  const { name, email, password, isAdmin } = parsed.data;

  const existing = await prisma.manager.findUnique({ where: { email } });
  if (existing) throw new Error("כתובת המייל כבר בשימוש");

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.manager.create({
    data: { restaurantId, name, email, passwordHash, isAdmin, active: true },
  });

  revalidatePath("/users");
  redirect("/users");
}

// ─── Update details (name / email / admin flag) ──────────────────────────────
const updateSchema = z.object({
  name: z.string().trim().min(1, "שם חובה").max(60),
  email: z.string().trim().toLowerCase().email("כתובת לא תקינה"),
  isAdmin: z.boolean().default(false),
});

export async function updateManagerAction(id: string, formData: FormData) {
  const { restaurantId } = await requireAdmin();

  const parsed = updateSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    isAdmin: formData.get("isAdmin") === "on",
  });
  if (!parsed.success) {
    throw new Error(parsed.error.errors.map((e) => e.message).join(", "));
  }
  const { name, email, isAdmin } = parsed.data;

  const target = await prisma.manager.findFirst({
    where: { id, restaurantId },
  });
  if (!target) throw new Error("המשתמש לא נמצא");

  // Email uniqueness excluding self
  const clash = await prisma.manager.findUnique({ where: { email } });
  if (clash && clash.id !== id) throw new Error("כתובת המייל כבר בשימוש");

  // Don't allow demoting the last active admin out of admin.
  if (target.isAdmin && !isAdmin) {
    await assertNotLastActiveAdmin(restaurantId, id);
  }

  await prisma.manager.update({
    where: { id },
    data: { name, email, isAdmin },
  });

  revalidatePath("/users");
  revalidatePath(`/users/${id}`);
  redirect("/users");
}

// ─── Change password (admin sets it directly, no current-password needed) ─────
const passwordSchema = z
  .object({
    newPassword: z.string().min(8, "סיסמה חדשה: 8 תווים לפחות"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "הסיסמאות לא תואמות",
    path: ["confirmPassword"],
  });

export async function changeManagerPasswordAction(
  id: string,
  formData: FormData,
) {
  const { restaurantId } = await requireAdmin();

  const parsed = passwordSchema.safeParse({
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    throw new Error(parsed.error.errors.map((e) => e.message).join(", "));
  }

  const target = await prisma.manager.findFirst({
    where: { id, restaurantId },
  });
  if (!target) throw new Error("המשתמש לא נמצא");

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
  await prisma.manager.update({ where: { id }, data: { passwordHash } });

  revalidatePath(`/users/${id}`);
  redirect("/users");
}

// ─── Enable / disable ─────────────────────────────────────────────────────────
export async function setManagerActiveAction(id: string, active: boolean) {
  const { callerId, restaurantId } = await requireAdmin();

  if (id === callerId && !active) {
    throw new Error("לא ניתן להשבית את החשבון של עצמך");
  }
  if (!active) {
    await assertNotLastActiveAdmin(restaurantId, id);
  }

  const target = await prisma.manager.findFirst({
    where: { id, restaurantId },
  });
  if (!target) throw new Error("המשתמש לא נמצא");

  await prisma.manager.update({ where: { id }, data: { active } });
  revalidatePath("/users");
}

// ─── Delete ────────────────────────────────────────────────────────────────────
// Removes the manager. Their audit-log rows are removed in the same transaction
// (AuditLog.manager is a required FK, so they must go together). Prefer
// "disable" over "delete" if you want to keep the audit trail.
export async function deleteManagerAction(id: string) {
  const { callerId, restaurantId } = await requireAdmin();

  if (id === callerId) {
    throw new Error("לא ניתן למחוק את החשבון של עצמך");
  }
  await assertNotLastActiveAdmin(restaurantId, id);

  const target = await prisma.manager.findFirst({
    where: { id, restaurantId },
  });
  if (!target) throw new Error("המשתמש לא נמצא");

  await prisma.$transaction([
    prisma.auditLog.deleteMany({ where: { managerId: id } }),
    prisma.manager.delete({ where: { id } }),
  ]);

  revalidatePath("/users");
  redirect("/users");
}
