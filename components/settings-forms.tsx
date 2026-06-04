"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordField } from "@/components/password-field";
import {
  updateProfileAction,
  changePasswordAction,
  type SettingsActionState,
} from "@/app/(app)/settings/actions";

const initial: SettingsActionState = {};

function FormMessage({ state }: { state: SettingsActionState }) {
  if (state.error) {
    return (
      <p role="alert" className="text-sm text-rose-600">
        {state.error}
      </p>
    );
  }
  if (state.ok) {
    return (
      <p role="status" className="text-sm text-emerald-600">
        נשמר בהצלחה ✓
      </p>
    );
  }
  return null;
}

export function ProfileForm({
  defaultName,
  defaultEmail,
}: {
  defaultName: string;
  defaultEmail: string;
}) {
  const [state, formAction, isPending] = useActionState(
    updateProfileAction,
    initial,
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="profile-name">שם מלא</Label>
        <Input
          id="profile-name"
          name="name"
          defaultValue={defaultName}
          required
          placeholder="לדוגמה: שם מלא"
        />
        <p className="text-xs text-slate-500">יוצג בדאשבורד ובהיסטוריית פעולות</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="profile-email">דוא״ל לכניסה</Label>
        <Input
          id="profile-email"
          name="email"
          type="email"
          defaultValue={defaultEmail}
          required
          dir="ltr"
          className="text-start"
        />
      </div>
      <div className="flex items-center justify-between gap-3">
        <FormMessage state={state} />
        <Button type="submit" disabled={isPending}>
          {isPending ? "שומר..." : "שמור שינויים"}
        </Button>
      </div>
    </form>
  );
}

export function ChangePasswordForm() {
  const [state, formAction, isPending] = useActionState(
    changePasswordAction,
    initial,
  );

  return (
    <form action={formAction} className="space-y-4">
      <PasswordField
        name="currentPassword"
        label="סיסמה נוכחית"
        autoComplete="current-password"
      />
      <PasswordField
        name="newPassword"
        label="סיסמה חדשה"
        autoComplete="new-password"
        minLength={8}
        hint="8 תווים לפחות"
      />
      <PasswordField
        name="confirmPassword"
        label="אישור סיסמה חדשה"
        autoComplete="new-password"
        minLength={8}
      />
      <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-2 text-xs text-amber-800">
        לאחר שינוי הסיסמה תתבצע התנתקות אוטומטית. תידרש/י להיכנס מחדש.
      </div>
      <div className="flex items-center justify-between gap-3">
        <FormMessage state={state} />
        <Button type="submit" variant="secondary" disabled={isPending}>
          {isPending ? "מעדכן..." : "שנה סיסמה"}
        </Button>
      </div>
    </form>
  );
}
