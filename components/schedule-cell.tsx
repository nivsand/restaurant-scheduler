"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { ReassignMenu } from "@/components/reassign-menu";
import { setLockAction } from "@/app/(app)/schedule/actions";

export interface SlotChip {
  slotIndex: number;
  employeeId: string | null;
  employeeName: string | null;
  locked: boolean;
  score: number | null;
  breakdown?: string | null; // JSON
}

export function ScheduleCell({
  weekId,
  day,
  shiftType,
  isClosed,
  chips,
  readOnly,
  cellTint,
  closedTint,
}: {
  weekId: string;
  day: number;
  shiftType: string;
  /** true when this combination has 0 headcount in the template */
  isClosed: boolean;
  chips: SlotChip[];
  readOnly: boolean;
  /** Tailwind classes for the open cell background (from theme) */
  cellTint: string;
  /** Tailwind classes for the closed cell background (from theme) */
  closedTint: string;
}) {
  const [openSlotIdx, setOpenSlotIdx] = useState<number | null>(null);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (isClosed) {
    return (
      <td
        className={cn(
          "border border-slate-300 p-1 text-center text-xs font-semibold",
          closedTint,
        )}
      >
        סגור
      </td>
    );
  }

  function toggleLock(slotIndex: number, locked: boolean) {
    startTransition(async () => {
      await setLockAction(
        JSON.stringify({ weekId, day, shiftType, slotIndex, locked: !locked }),
      );
      router.refresh();
    });
  }

  return (
    <td
      className={cn(
        "border border-slate-300 align-middle p-1",
        cellTint,
      )}
    >
      <div className="space-y-0.5">
        {chips.map((chip) => (
          <div
            key={chip.slotIndex}
            className={cn(
              "group relative flex items-center justify-center gap-1 rounded-md px-1 py-0.5 text-xs transition-all",
              chip.employeeId
                ? chip.locked
                  ? "bg-white/80 ring-1 ring-brand-400 font-semibold"
                  : "hover:bg-white/60"
                : "text-rose-600",
            )}
          >
            <button
              type="button"
              disabled={readOnly || isPending}
              onClick={() => setOpenSlotIdx(chip.slotIndex)}
              className="flex-1 truncate text-center font-medium"
              title={
                chip.score != null ? `ציון: ${chip.score.toFixed(0)}` : undefined
              }
            >
              {chip.employeeName ?? "— ריק —"}
            </button>
            {chip.employeeId && !readOnly && (
              <button
                type="button"
                onClick={() => toggleLock(chip.slotIndex, chip.locked)}
                disabled={isPending}
                className={cn(
                  "shrink-0 rounded px-1 text-[10px] transition-opacity",
                  chip.locked
                    ? "text-brand-600 opacity-100"
                    : "text-slate-300 opacity-0 group-hover:opacity-100",
                )}
                title={chip.locked ? "נעול — לחץ לביטול" : "נעל שיבוץ"}
              >
                {chip.locked ? "🔒" : "🔓"}
              </button>
            )}
          </div>
        ))}
        {!readOnly && chips.length === 0 && (
          <button
            type="button"
            onClick={() => setOpenSlotIdx(0)}
            className="block w-full rounded-md py-0.5 text-center text-xs text-slate-400 hover:bg-white/60"
          >
            +
          </button>
        )}
      </div>

      {openSlotIdx !== null && !readOnly && (
        <ReassignMenu
          weekId={weekId}
          day={day}
          shiftType={shiftType}
          slotIndex={openSlotIdx}
          currentEmployeeId={
            chips.find((c) => c.slotIndex === openSlotIdx)?.employeeId ?? null
          }
          onClose={() => setOpenSlotIdx(null)}
        />
      )}
    </td>
  );
}
