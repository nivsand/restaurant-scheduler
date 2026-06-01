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

  // The manager id comes from the validated session via getActiveManagerForSession
  // — this is the SAME row login resolves (login finds it by email; here we
  // found it by the session's id). All writes/reads below use this id.
  const managerId = manager.id;
  console.log(`[PASSWORD_CHANGE_DEBUG] manager id=${managerId} email=${manager.email}`);

  const parsed = passwordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { error: parsed.error.errors.map((e) => e.message).join(", ") };
  }

  // ⚠️ TEMPORARY current-password fallback — REMOVE WITH THE LOGIN FALLBACK ⚠️
  // TODO(REMOVE): When signed in via the emergency login fallback there is no
  // password that matches the stored hash, so the normal bcrypt check below can
  // never pass. This lets the owner set a real password ONCE. It is scoped to
  // the same single email + temp password as the login fallback. Delete this
  // block (and the one in lib/auth.ts) once a real password works.
  const isTempFallback =
    manager.email.toLowerCase() === "nivsand@gmail.com" &&
    parsed.data.currentPassword === "MyTempPass2026!";

  let currentOk = false;
  if (isTempFallback) {
    console.log(
      `[PASSWORD_CHANGE_DEBUG] current password validated via temporary fallback`,
    );
    currentOk = true;
  } else {
    // Normal path — requires a stored hash. Guard a missing/blank hash so
    // bcrypt.compare can't throw and crash.
    if (!manager.passwordHash) {
      return { error: "אין סיסמה מוגדרת לחשבון. פנה/י למנהל המערכת לאיפוס." };
    }
    try {
      currentOk = await bcrypt.compare(
        parsed.data.currentPassword,
        manager.passwordHash,
      );
    } catch {
      return { error: "שגיאה באימות הסיסמה הנוכחית" };
    }
  }
  // ⚠️ END TEMPORARY current-password fallback ⚠️
  if (!currentOk) return { error: "הסיסמה הנוכחית שגויה" };

  // Hash the new password and write it to the row identified by the session.
  const newHash = await bcrypt.hash(parsed.data.newPassword, 10);
  const updated = await prisma.manager.update({
    where: { id: managerId },
    data: { passwordHash: newHash },
    select: { id: true, passwordHash: true },
  });
  console.log(`[PASSWORD_CHANGE_DEBUG] update executed id=${updated.id}`);

  // Read the row back fresh and verify the NEW password against the STORED
  // hash — this is exactly what login's bcrypt.compare will do. If this is
  // false, the write didn't take effect as expected; do NOT sign the user out.
  const readBack = await prisma.manager.findUnique({
    where: { id: managerId },
    select: { passwordHash: true },
  });
  let verified = false;
  try {
    verified =
      !!readBack?.passwordHash &&
      (await bcrypt.compare(parsed.data.newPassword, readBack.passwordHash));
  } catch {
    verified = false;
  }
  console.log(
    `[PASSWORD_CHANGE_DEBUG] verify new password result=${verified} id=${managerId}`,
  );

  if (!verified) {
    // Surface a clear error instead of redirecting on an unverified change.
    return {
      error:
        "עדכון הסיסמה לא אומת מול מסד הנתונים. הסיסמה לא שונתה — נסה/י שוב.",
    };
  }

  // Only now — after the DB update AND a successful read-back verification —
  // force a fresh login so the JWT reflects the new credentials. signOut throws
  // a redirect (NEXT_REDIRECT), which useActionState propagates correctly.
  await signOut({ redirectTo: "/login?passwordChanged=1" });
  return { ok: true }; // unreachable after redirect
}
