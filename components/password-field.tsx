"use client";

import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function PasswordField({
  name,
  label,
  hint,
  autoComplete,
  minLength,
  required = true,
}: {
  name: string;
  label: string;
  hint?: string;
  autoComplete?: string;
  minLength?: number;
  required?: boolean;
}) {
  const [show, setShow] = useState(false);
  const inputId = useId();
  const hintId = useId();

  return (
    <div className="space-y-1.5">
      <Label htmlFor={inputId}>{label}</Label>
      <div className="relative">
        <Input
          id={inputId}
          name={name}
          type={show ? "text" : "password"}
          required={required}
          minLength={minLength}
          autoComplete={autoComplete}
          dir="ltr"
          aria-describedby={hint ? hintId : undefined}
          // pr-10 keeps the typed text clear of the toggle button on the right
          className="text-start pr-10"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "הסתר סיסמה" : "הצג סיסמה"}
          aria-pressed={show}
          aria-controls={inputId}
          className="absolute inset-y-0 right-0 flex items-center rounded-e-lg px-3 text-brown-400 transition-colors hover:text-brown-700 focus-visible:text-brown-700"
        >
          {show ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
      {hint && (
        <p id={hintId} className="text-xs text-brown-500">
          {hint}
        </p>
      )}
    </div>
  );
}

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c6.5 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.5 13.5 0 0 0 2 12s3.5 7 10 7a9.12 9.12 0 0 0 5.39-1.61" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}
