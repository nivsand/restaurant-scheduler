"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { ReassignMenu } from "@/components/reassign-menu";
import { setLockAction } from "@/app/(app)/schedule/actions";
import { updateFridayFloorSplitTimeAction } from "@/app/(app)/schedule/notes-actions";

export interface SlotChip {
  slotIndex: number;
  employeeId: string | null;
  employeeName: string | null;
  note?: string | null;
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
  cleanExport,
  fridayFloorSplitTimes,
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
  /** true for final exports (PDF/print/WhatsApp/Excel): hide lock/edit-state styling */
  cleanExport?: boolean;
  /** Friday "פלור בוקר" only: default/override start times for the two slots */
  fridayFloorSplitTimes?: [string, string];
}) {
  const [openSlotIdx, setOpenSlotIdx] = useState<number | null>(null);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (isClosed) {
    return (
      <td
        className={cn(
          "border border-brown-400 p-1 text-center text-xs font-semibold",
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

  function setSplitTime(slotIndex: 0 | 1, time: string) {
    startTransition(async () => {
      await updateFridayFloorSplitTimeAction(
        JSON.stringify({ weekId, slotIndex, time }),
      );
      router.refresh();
    });
  }

  // Friday "פלור בוקר" split: only when both slots are filled. A single
  // assigned employee (or an empty slot) falls back to the normal layout.
  const showFridayFloorSplit =
    !!fridayFloorSplitTimes &&
    chips.length === 2 &&
    !!chips[0].employeeId &&
    !!chips[1].employeeId;

  if (showFridayFloorSplit) {
    return (
      <td className={cn("border border-brown-400 align-middle p-1", cellTint)}>
        <div className="divide-y divide-brown-400/40">
          {chips.map((chip, idx) => (
            <div
              key={chip.slotIndex}
              className="flex items-center justify-center gap-1 px-1 py-0.5 text-xs"
            >
              <button
                type="button"
                disabled={readOnly || isPending}
                onClick={() => setOpenSlotIdx(chip.slotIndex)}
                className="min-w-0 flex-1 text-center"
              >
                <span className="block truncate font-semibold text-brown-900">
                  {chip.employeeName}
                </span>
              </button>
              {!readOnly && !cleanExport ? (
                <input
                  type="time"
                  value={fridayFloorSplitTimes![idx]}
                  onChange={(e) => setSplitTime(idx as 0 | 1, e.target.value)}
                  disabled={isPending}
                  className="num w-[4.5rem] shrink-0 rounded border border-brown-400 bg-white/70 px-0.5 text-[10px]"
                />
              ) : (
                <span className="num shrink-0 text-[10px] text-brown-600">
                  ({fridayFloorSplitTimes![idx]})
                </span>
              )}
            </div>
          ))}
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

  return (
    <td
      className={cn(
        "border border-brown-400 align-middle p-1",
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
                ? chip.locked && !cleanExport
                  ? "bg-white/80 ring-1 ring-brand-400 font-semibold"
                  : "hover:bg-white/60"
                : "text-rose-600",
            )}
          >
            <button
              type="button"
              disabled={readOnly || isPending}
              onClick={() => setOpenSlotIdx(chip.slotIndex)}
              className="min-w-0 flex-1 text-center"
              title={
                [
                  chip.score != null ? `ציון: ${chip.score.toFixed(0)}` : null,
                  chip.note,
                ]
                  .filter(Boolean)
                  .join(" · ") || undefined
              }
            >
              <span
                className={cn(
                  "block truncate",
                  chip.employeeName
                    ? "font-semibold text-brown-900"
                    : "font-medium",
                )}
              >
                {chip.employeeName ?? "— ריק —"}
              </span>
              {chip.employeeName && chip.note && (
                <span className="mt-0.5 block truncate text-[10px] font-normal leading-tight text-brown-500">
                  {chip.note}
                </span>
              )}
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
                    : "text-brown-400 opacity-0 group-hover:opacity-100",
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
            className="block w-full rounded-md py-0.5 text-center text-xs text-brown-400 hover:bg-white/60"
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
