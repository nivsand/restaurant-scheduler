"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  generateScheduleAction,
  approveScheduleAction,
  reopenScheduleAction,
} from "@/app/(app)/schedule/actions";

export function ScheduleControls({
  weekId,
  weekStatus,
  hasAssignments,
}: {
  weekId: string;
  weekStatus: "draft" | "approved" | string;
  hasAssignments: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [lastRun, setLastRun] = useState<{
    seed: number;
    emptySlots: number;
    durationMs: number;
    trials: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function generate(opts?: { shuffle?: boolean }) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await generateScheduleAction(
          JSON.stringify({
            weekId,
            seed: opts?.shuffle ? `shuffle:${Date.now()}` : undefined,
          }),
        );
        setLastRun({
          seed: result.seed,
          emptySlots: result.emptySlots,
          durationMs: result.durationMs,
          trials: result.trials,
        });
        router.refresh();
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  function approve() {
    setError(null);
    startTransition(async () => {
      try {
        await approveScheduleAction(weekId);
        router.refresh();
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  function reopen() {
    setError(null);
    startTransition(async () => {
      try {
        await reopenScheduleAction(weekId);
        router.refresh();
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  const isApproved = weekStatus === "approved";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {!hasAssignments ? (
          <Button onClick={() => generate()} disabled={isPending} size="lg">
            {isPending ? "מייצר סידור..." : "ייצר סידור"}
          </Button>
        ) : (
          <>
            <Button
              onClick={() => generate()}
              disabled={isPending || isApproved}
              variant="secondary"
            >
              {isPending ? "מעבד..." : "ייצר מחדש"}
            </Button>
            <Button
              onClick={() => generate({ shuffle: true })}
              disabled={isPending || isApproved}
              variant="ghost"
              title="ערבב וייצר סידור חדש (זרע אקראי)"
            >
              🎲 ערבב וייצר
            </Button>
            {!isApproved ? (
              <Button onClick={approve} disabled={isPending}>
                אשר סידור
              </Button>
            ) : (
              <Button onClick={reopen} disabled={isPending} variant="ghost">
                החזר לעריכה
              </Button>
            )}
          </>
        )}
      </div>

      {lastRun && (
        <div className="text-xs text-slate-500">
          הסידור נוצר מתוך <span className="num">{lastRun.trials}</span> ניסיונות
          {lastRun.emptySlots > 0 ? (
            <>
              {" "}·{" "}
              <span className="text-rose-600">
                {lastRun.emptySlots} משבצות חסרות
              </span>
            </>
          ) : (
            <> · <span className="text-emerald-600">כל המשבצות מלאות</span></>
          )}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}
    </div>
  );
}
