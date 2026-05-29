"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { auth, signOut } from "@/lib/auth";
import { prisma } from "@/lib/db";

const profileSchema = z.object({
  name: z.string().trim().min(1, "שם חובה").max(60),
  email: z.string().trim().toLowerCase().email("כתובת לא תקינה"),
});

export async function updateProfileAction(formData: FormData) {
  const session = await auth();
  const managerId = session!.user.id;

  const parsed = profileSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
  });
  if (!parsed.success) {
    throw new Error(parsed.error.errors.map((e) => e.message).join(", "));
  }
  const { name, email } = parsed.data;

  // Email-uniqueness check excluding self
  const existing = await prisma.manager.findUnique({ where: { email } });
  if (existing && existing.id !== managerId) {
    throw new Error("כתובת המייל כבר בשימוש");
  }

  await prisma.manager.update({
    where: { id: managerId },
    data: { name, email },
  });
  revalidatePath("/settings");
  revalidatePath("/dashboard");
}

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "נדרשת סיסמה נוכחית"),
    newPassword: z.string().min(8, "סיסמה חדשה: 8 תווים לפחות"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "הסיסמאות לא תואמות",
    path: ["confirmPassword"],
  });

export async function changePasswordAction(formData: FormData) {
  const session = await auth();
  const managerId = session!.user.id;

  const parsed = passwordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    throw new Error(parsed.error.errors.map((e) => e.message).join(", "));
  }

  const manager = await prisma.manager.findUnique({
    where: { id: managerId },
  });
  if (!manager) throw new Error("המשתמש לא נמצא");

  const ok = await bcrypt.compare(parsed.data.currentPassword, manager.passwordHash);
  if (!ok) throw new Error("הסיסמה הנוכחית שגויה");

  const hash = await bcrypt.hash(parsed.data.newPassword, 10);
  await prisma.manager.update({
    where: { id: managerId },
    data: { passwordHash: hash },
  });

  // Force a fresh login so JWT carries the new credentials
  await signOut({ redirectTo: "/login?passwordChanged=1" });
}
