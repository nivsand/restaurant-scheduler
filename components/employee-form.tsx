"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardBody } from "@/components/ui/card";

export interface EmployeeFormValues {
  name: string;
  role: "kitchen" | "floor" | "both";
  email: string | null;
  maxShifts: number | null;
  minShifts: number | null;
  onlyMornings: boolean;
  onlyEvenings: boolean;
  noClosings: boolean;
  weekendOk: boolean;
  notes: string | null;
}

export function EmployeeForm({
  action,
  initial,
  submitLabel,
}: {
  action: (formData: FormData) => Promise<void> | void;
  initial?: Partial<EmployeeFormValues>;
  submitLabel: string;
}) {
  const [onlyMornings, setOnlyMornings] = useState(!!initial?.onlyMornings);
  const [onlyEvenings, setOnlyEvenings] = useState(!!initial?.onlyEvenings);

  return (
    <form action={action} className="space-y-5">
      <Card>
        <CardBody className="space-y-5">
          <Field label="שם מלא">
            <Input
              name="name"
              required
              defaultValue={initial?.name ?? ""}
              placeholder="לדוגמה: רוני"
              autoFocus
            />
          </Field>

          <Field label="אימייל / שם משתמש (להתחברות)">
            <Input
              name="email"
              type="text"
              defaultValue={initial?.email ?? ""}
              placeholder="לדוגמה: roni@email.com"
              dir="ltr"
              className="text-start"
              maxLength={120}
            />
          </Field>

          <Field label="תפקיד">
            <div className="grid grid-cols-3 gap-2">
              {(["kitchen", "floor", "both"] as const).map((role) => (
                <label
                  key={role}
                  className="flex cursor-pointer items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 has-[:checked]:text-brand-700"
                >
                  <input
                    type="radio"
                    name="role"
                    value={role}
                    defaultChecked={(initial?.role ?? "both") === role}
                    className="sr-only"
                  />
                  {role === "kitchen" ? "מטבח" : role === "floor" ? "פלור" : "שניהם"}
                </label>
              ))}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="מינ׳ משמרות בשבוע">
              <Input
                name="minShifts"
                type="number"
                min={0}
                max={14}
                inputMode="numeric"
                defaultValue={initial?.minShifts ?? ""}
                dir="ltr"
                className="text-start"
              />
            </Field>
            <Field label="מקס׳ משמרות בשבוע">
              <Input
                name="maxShifts"
                type="number"
                min={0}
                max={14}
                inputMode="numeric"
                defaultValue={initial?.maxShifts ?? ""}
                dir="ltr"
                className="text-start"
              />
            </Field>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-900">העדפות</h3>
          <Toggle
            name="onlyMornings"
            label="רק משמרות בוקר"
            checked={onlyMornings}
            onChange={(v) => {
              setOnlyMornings(v);
              if (v) setOnlyEvenings(false);
            }}
          />
          <Toggle
            name="onlyEvenings"
            label="רק משמרות ערב"
            checked={onlyEvenings}
            onChange={(v) => {
              setOnlyEvenings(v);
              if (v) setOnlyMornings(false);
            }}
          />
          <Toggle
            name="noClosings"
            label="בלי משמרות סגירה"
            defaultChecked={!!initial?.noClosings}
          />
          <Toggle
            name="weekendOk"
            label="זמין לסופ״ש (שישי סגירה)"
            defaultChecked={initial?.weekendOk ?? true}
          />
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <Field label="הערות (אופציונלי)">
            <Textarea
              name="notes"
              rows={3}
              defaultValue={initial?.notes ?? ""}
              placeholder="לדוגמה: רגישות לתפקיד שף, מחפש בעיקר ערבים"
            />
          </Field>
        </CardBody>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="submit" size="lg">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Toggle({
  name,
  label,
  checked,
  defaultChecked,
  onChange,
}: {
  name: string;
  label: string;
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (v: boolean) => void;
}) {
  const isControlled = checked !== undefined;
  return (
    <label className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2 hover:bg-slate-50">
      <span className="text-sm text-slate-700">{label}</span>
      <input
        type="checkbox"
        name={name}
        {...(isControlled
          ? { checked, onChange: (e) => onChange?.(e.target.checked) }
          : { defaultChecked })}
        className="h-5 w-9 cursor-pointer appearance-none rounded-full bg-slate-200 transition-colors checked:bg-brand-500 relative before:absolute before:top-0.5 before:start-0.5 before:h-4 before:w-4 before:rounded-full before:bg-white before:transition-transform checked:before:translate-x-[-1rem] rtl:checked:before:translate-x-4"
      />
    </label>
  );
}
