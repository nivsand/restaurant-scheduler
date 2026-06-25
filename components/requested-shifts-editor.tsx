"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setRequestedShiftsAction } from "@/app/(app)/availability/actions";
import { cn } from "@/lib/utils";

export function RequestedShiftsEditor({
  weekId,
  employeeId,
  initial,
}: {
  weekId: string;
  employeeId: string;
  initial: number | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState<string>(initial == null ? "" : String(initial));
  const [savedValue, setSavedValue] = useState(value);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const v = initial == null ? "" : String(initial);
    setValue(v);
    setSavedValue(v);
  }, [initial]);

  function save() {
    if (value === savedValue) return;
    setError(null);
    let n: number | null = null;
    if (value.trim() !== "") {
      const parsed = parseInt(value.trim(), 10);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 14) {
        setError("בין 0 ל-14");
        return;
      }
      n = parsed;
    }
    startTransition(async () => {
      try {
        await setRequestedShiftsAction(
          JSON.stringify({ weekId, employeeId, requestedShifts: n }),
        );
        setSavedValue(value);
        router.refresh();
      } catch (err) {
        setError((err as Error).message);
        setValue(savedValue);
      }
    });
  }

  return (
    <div className="mt-3 inline-flex items-center gap-2 rounded-xl bg-cream-50 px-3 py-1.5 ring-1 ring-cream-200">
      <span className="text-xs font-medium text-brown-700">משמרות מבוקשות:</span>
      <input
        type="number"
        min={0}
        max={14}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
        }}
        disabled={isPending}
        placeholder="—"
        dir="ltr"
        className={cn(
          "h-7 w-14 rounded-md border border-cream-200 bg-white text-center text-sm num",
          "focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-300",
          isPending && "opacity-60",
        )}
      />
      {error && <span className="text-[10px] text-rose-600">{error}</span>}
      <span className="text-[10px] text-brown-400">
        (תקרה קשיחה למנוע)
      </span>
    </div>
  );
}
