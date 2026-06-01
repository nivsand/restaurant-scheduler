"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { auth, signOut } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  getActiveManagerForSession,
  hasValidSessionUser,
} from "@/lib/session-validation";

// Shape consumed by useActionState on the client. Actions never throw for
// expected/validation failures — they return { error } so the UI can show an
// inline message instead of crashing the route.
export interface SettingsActionState {
  ok?: boolean;
  error?: string;
}

const SESSION_EXPIRED = "ההתחברות פגה. התחבר/י מחדש.";

// Resolve the current, active manager from the session — gracefully (no throw).
async function currentManager() {
  const session = await auth();
  if (!hasValidSessionUser(session)) return null;
  return getActiveManagerForSession(session);
}

// ─── Profile (name / email) ──────────────────────────────────────────────────
const profileSchema = z.object({
  name: z.string().trim().min(1, "שם חובה").max(60),
  email: z.string().trim().toLowerCase().email("כתובת לא תקינה"),
});

export async function updateProfileAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const manager = await currentManager();
  if (!manager) return { error: SESSION_EXPIRED };

  const parsed = profileSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
  });
  if (!parsed.success) {
    return { error: parsed.error.errors.map((e) => e.message).join(", ") };
  }
  const { name, email } = parsed.data;

  // Email-uniqueness check excluding self
  const existing = await prisma.manager.findUnique({ where: { email } });
  if (existing && existing.id !== manager.id) {
    return { error: "כתובת המייל כבר בשימוש" };
  }

  await prisma.manager.update({
    where: { id: manager.id },
    data: { name, email },
  });
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { ok: true };
}

// ─── Password change ─────────────────────────────────────────────────────────
const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "נדרשת סיסמה נוכחית"),
    newPassword: z.string().min(8, "סיסמה חדשה: 8 תווים לפחות"),
    confirmPassword: z.string().min(1, "נדרש אישור סיסמה"),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "הסיסמאות לא תואמות",
    path: ["confirmPassword"],
  });

export async function changePasswordAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const manager = await currentManager();
  if (!manager) return { error: SESSION_EXPIRED };

  const parsed = passwordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { error: parsed.error.errors.map((e) => e.message).join(", ") };
  }

  // Guard a missing/blank hash so bcrypt.compare can't throw and crash.
  if (!manager.passwordHash) {
    return { error: "אין סיסמה מוגדרת לחשבון. פנה/י למנהל המערכת לאיפוס." };
  }

  let ok = false;
  try {
    ok = await bcrypt.compare(parsed.data.currentPassword, manager.passwordHash);
  } catch {
    return { error: "שגיאה באימות הסיסמה הנוכחית" };
  }
  if (!ok) return { error: "הסיסמה הנוכחית שגויה" };

  const hash = await bcrypt.hash(parsed.data.newPassword, 10);
  await prisma.manager.update({
    where: { id: manager.id },
    data: { passwordHash: hash },
  });

  // Force a fresh login so the JWT reflects the new credentials. signOut throws
  // a redirect (NEXT_REDIRECT), which useActionState propagates correctly.
  await signOut({ redirectTo: "/login?passwordChanged=1" });
  return { ok: true }; // unreachable after redirect
}
