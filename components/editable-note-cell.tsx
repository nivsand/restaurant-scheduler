"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { updateScheduleNoteAction } from "@/app/(app)/schedule/notes-actions";
import { cn } from "@/lib/utils";

export type NoteKind = "event" | "shift_manager" | "hours";

export function EditableNoteCell({
  weekId,
  day,
  kind,
  initial,
  readOnly,
  placeholder,
}: {
  weekId: string;
  day: number;
  kind: NoteKind;
  initial: string;
  readOnly?: boolean;
  placeholder?: string;
}) {
  const [value, setValue] = useState(initial);
  const [savedValue, setSavedValue] = useState(initial);
  const [isPending, startTransition] = useTransition();
  const ref = useRef<HTMLTextAreaElement>(null);

  // Reflect updates from server-side renders (e.g. when another user edited)
  useEffect(() => {
    setValue(initial);
    setSavedValue(initial);
  }, [initial]);

  function save() {
    if (value === savedValue) return;
    const toSave = value;
    startTransition(async () => {
      try {
        await updateScheduleNoteAction(
          JSON.stringify({ weekId, day, kind, content: toSave }),
        );
        setSavedValue(toSave);
      } catch {
        // revert on error
        setValue(savedValue);
      }
    });
  }

  if (readOnly) {
    return (
      <div className="whitespace-pre-wrap break-words text-center text-xs leading-tight">
        {value}
      </div>
    );
  }

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === "Escape") {
          setValue(savedValue);
          e.currentTarget.blur();
        }
      }}
      placeholder={placeholder ?? "—"}
      rows={1}
      disabled={isPending}
      className={cn(
        "w-full resize-none bg-transparent text-center text-xs leading-tight outline-none transition-all",
        "placeholder:text-slate-300/70 focus:bg-white/70 focus:ring-1 focus:ring-brand-300 rounded-sm",
        isPending && "opacity-60",
      )}
      style={{ minHeight: "1.5rem" }}
    />
  );
}
