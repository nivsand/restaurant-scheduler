"use client";

import { useState, useTransition } from "react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  setEmployeePasswordAction,
  clearEmployeePasswordAction,
} from "@/app/(app)/employees/actions";

export function EmployeeCredentialsCard({
  employeeId,
  hasEmail,
  hasPassword,
}: {
  employeeId: string;
  hasEmail: boolean;
  hasPassword: boolean;
}) {
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSetPassword() {
    if (password.length < 4) {
      setMsg({ ok: false, text: "סיסמה חייבת להכיל לפחות 4 תווים" });
      return;
    }
    startTransition(async () => {
      try {
        await setEmployeePasswordAction(
          JSON.stringify({ employeeId, password }),
        );
        setPassword("");
        setMsg({ ok: true, text: "סיסמה הוגדרה בהצלחה" });
      } catch (err) {
        setMsg({ ok: false, text: (err as Error).message });
      }
    });
  }

  function handleClearPassword() {
    startTransition(async () => {
      try {
        await clearEmployeePasswordAction(employeeId);
        setMsg({ ok: true, text: "סיסמה נמחקה" });
      } catch (err) {
        setMsg({ ok: false, text: (err as Error).message });
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>התחברות עובד</CardTitle>
      </CardHeader>
      <CardBody className="space-y-3">
        {!hasEmail ? (
          <p className="text-sm text-slate-500">
            יש להגדיר אימייל/שם משתמש בטופס למעלה לפני הגדרת סיסמה.
          </p>
        ) : (
          <>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-slate-600">סטטוס:</span>
              {hasPassword ? (
                <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                  סיסמה מוגדרת
                </span>
              ) : (
                <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                  ללא סיסמה
                </span>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emp-password">
                {hasPassword ? "סיסמה חדשה" : "הגדרת סיסמה"}
              </Label>
              <div className="flex gap-2">
                <Input
                  id="emp-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="לפחות 4 תווים"
                  dir="ltr"
                  className="text-start"
                  minLength={4}
                />
                <Button
                  onClick={handleSetPassword}
                  disabled={pending}
                  size="sm"
                >
                  {pending ? "..." : "שמור"}
                </Button>
              </div>
            </div>
            {hasPassword && (
              <button
                onClick={handleClearPassword}
                disabled={pending}
                className="text-xs text-rose-600 hover:underline disabled:opacity-50"
              >
                מחק סיסמה (ביטול גישת התחברות)
              </button>
            )}
          </>
        )}
        {msg && (
          <p
            className={`text-sm ${msg.ok ? "text-emerald-600" : "text-rose-600"}`}
          >
            {msg.text}
          </p>
        )}
        <p className="text-xs text-slate-400">
          עובדים מתחברים דרך /employee/login עם האימייל והסיסמה שהוגדרו כאן.
        </p>
      </CardBody>
    </Card>
  );
}
