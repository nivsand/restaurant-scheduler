"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cloneWeekAction } from "@/app/(app)/schedule/actions";

function toDateInputDefault(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
}

export function CloneWeekDialog({ sourceWeekId }: { sourceWeekId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [dateValue, setDateValue] = useState(toDateInputDefault);
  const [conflict, setConflict] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setConflict(false);
    setError(null);
  }

  function handleClone(force = false) {
    if (!dateValue) { setError("בחר/י תאריך"); return; }
    setError(null);
    startTransition(async () => {
      try {
        const result = await cloneWeekAction(sourceWeekId, dateValue, force);
        if ("conflict" in result) {
          setConflict(true);
        } else {
          router.push(`/schedule/${result.targetWeekId}`);
        }
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  if (!open) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        title="העתק שיבוצים, הערות ומשמרות לשבוע אחר"
      >
        📋 שכפל שבוע
      </Button>
    );
  }

  return (
    <div className="rounded-xl border border-brand-200 bg-brand-50/30 p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold text-brown-900">שכפל שבוע</h4>
          <p className="mt-0.5 text-xs text-brown-500">
            מעתיק שיבוצים, הערות ומספרי משמרות. זמינות WhatsApp לא מועתקת. הסידור ביעד יהיה טיוטה.
          </p>
        </div>
        <button
          onClick={close}
          className="ms-3 text-brown-400 transition-colors hover:text-brown-700"
          aria-label="סגור"
        >
          ✕
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-brown-700">
            תאריך כלשהו בשבוע היעד
          </label>
          <input
            type="date"
            value={dateValue}
            onChange={(e) => {
              setDateValue(e.target.value);
              setConflict(false);
              setError(null);
            }}
            className="rounded-lg border border-cream-300 bg-white px-3 py-1.5 text-sm num focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
        </div>
        {!conflict && (
          <Button
            size="sm"
            onClick={() => handleClone(false)}
            disabled={isPending || !dateValue}
          >
            {isPending ? "מעתיק..." : "שכפל"}
          </Button>
        )}
      </div>

      {conflict && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-medium text-amber-800">
            ⚠️ לשבוע זה כבר יש שיבוצים. האם לדרוס אותם?
          </p>
          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              onClick={() => handleClone(true)}
              disabled={isPending}
            >
              {isPending ? "מעתיק..." : "כן, דרוס"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConflict(false)}
              disabled={isPending}
            >
              ביטול
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-2 text-xs text-rose-600">{error}</p>
      )}
    </div>
  );
}
