"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  explainSlotAction,
  reassignSlotAction,
  blockEmployeeAction,
  unblockEmployeeAction,
  type SlotExplanation,
} from "@/app/(app)/schedule/actions";

interface PendingOverride {
  employeeId: string;
  employeeName: string;
  reason: string;
}

export function ReassignMenu({
  weekId,
  day,
  shiftType,
  slotIndex,
  currentEmployeeId,
  onClose,
}: {
  weekId: string;
  day: number;
  shiftType: string;
  slotIndex: number;
  currentEmployeeId: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [explanation, setExplanation] = useState<SlotExplanation | null>(null);
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<PendingOverride | null>(null);
  const [showHardBlocked, setShowHardBlocked] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const e = await explainSlotAction(
          JSON.stringify({ weekId, day, shiftType, slotIndex }),
        );
        setExplanation(e);
      } catch {
        /* ignore */
      }
    })();
  }, [weekId, day, shiftType, slotIndex]);

  function assign(employeeId: string | null) {
    startTransition(async () => {
      await reassignSlotAction(
        JSON.stringify({ weekId, day, shiftType, slotIndex, employeeId }),
      );
      router.refresh();
      onClose();
    });
  }

  function block(employeeId: string) {
    startTransition(async () => {
      await blockEmployeeAction(
        JSON.stringify({ weekId, day, shiftType, employeeId }),
      );
      // Refresh in place so the menu updates without closing
      const e = await explainSlotAction(
        JSON.stringify({ weekId, day, shiftType, slotIndex }),
      );
      setExplanation(e);
      router.refresh();
    });
  }

  function unblock(employeeId: string) {
    startTransition(async () => {
      await unblockEmployeeAction(
        JSON.stringify({ weekId, day, shiftType, employeeId }),
      );
      const e = await explainSlotAction(
        JSON.stringify({ weekId, day, shiftType, slotIndex }),
      );
      setExplanation(e);
      router.refresh();
    });
  }

  // Categorize rows
  const eligible = explanation?.rows.filter((r) => r.eligible) ?? [];
  const softBlocked =
    explanation?.rows.filter((r) => !r.eligible && r.severity === "soft") ?? [];
  const hardBlocked =
    explanation?.rows.filter((r) => !r.eligible && r.severity === "hard") ?? [];

  return (
    <>
      <div
        className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center"
        onClick={onClose}
      >
        <div
          className="w-full max-w-md rounded-2xl bg-white shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="border-b border-slate-100 p-4">
            <h3 className="text-base font-semibold text-slate-900">
              שיבוץ למשבצת
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              לחיצה על עובד תקבע אותו לשיבוץ ידני (נעול)
            </p>
          </div>

          <div className="max-h-[60vh] overflow-y-auto p-4">
            {!explanation && (
              <div className="py-8 text-center text-sm text-slate-400">
                טוען...
              </div>
            )}

            {explanation && (
              <>
                {currentEmployeeId && (
                  <button
                    type="button"
                    onClick={() => assign(null)}
                    disabled={isPending}
                    className="mb-3 flex w-full items-center justify-between rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 hover:bg-rose-100"
                  >
                    <span>הסר עובד מהמשבצת</span>
                    <span>✕</span>
                  </button>
                )}

                {/* Eligible — green/normal */}
                <div className="mb-1 text-xs font-medium text-slate-500">
                  זמינים ({eligible.length})
                </div>
                <ul className="space-y-1">
                  {eligible.length === 0 && (
                    <li className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                      אין עובדים זמינים — שקלו להוסיף שיבוץ ידני מהרשימה למטה
                    </li>
                  )}
                  {eligible.map((r) => (
                    <li key={r.employeeId} className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => assign(r.employeeId)}
                        disabled={isPending}
                        className={cn(
                          "flex flex-1 items-center justify-between rounded-lg border px-3 py-2 text-start text-sm transition-colors",
                          r.employeeId === currentEmployeeId
                            ? "border-brand-400 bg-brand-50 text-brand-800"
                            : "border-slate-200 bg-white hover:bg-slate-50",
                        )}
                      >
                        <span className="font-medium">{r.employeeName}</span>
                        <span className="flex items-center gap-2 text-xs text-slate-500">
                          <span>{r.currentAssignments} שיבוצים</span>
                          {r.confidence != null && (
                            <span className="num">
                              {Math.round(r.confidence * 100)}%
                            </span>
                          )}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => block(r.employeeId)}
                        disabled={isPending}
                        title="חסום ממשמרת זו"
                        className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs text-rose-600 hover:bg-rose-50"
                      >
                        🚫
                      </button>
                    </li>
                  ))}
                </ul>

                {/* Soft-blocked — amber, clickable with confirmation */}
                {softBlocked.length > 0 && (
                  <div className="mt-4">
                    <div className="mb-1 text-xs font-medium text-amber-700">
                      ניתן לשבץ עם אזהרה ({softBlocked.length})
                    </div>
                    <ul className="space-y-1">
                      {softBlocked.map((r) => (
                        <li key={r.employeeId}>
                          <button
                            type="button"
                            onClick={() =>
                              setConfirming({
                                employeeId: r.employeeId,
                                employeeName: r.employeeName,
                                reason: r.reason ?? "",
                              })
                            }
                            disabled={isPending}
                            className="flex w-full items-center justify-between rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-start text-sm transition-colors hover:bg-amber-50"
                          >
                            <span className="font-medium text-amber-900">
                              {r.employeeName}
                            </span>
                            <span className="text-xs text-amber-700">
                              ⚠ {r.reason}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Hard-blocked — grey, not clickable. Manager-defined blocks
                    show an "unblock" button so they can be reversed in place. */}
                {hardBlocked.length > 0 && (
                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={() => setShowHardBlocked((s) => !s)}
                      className="mb-1 text-xs text-slate-500 hover:text-slate-700"
                    >
                      {showHardBlocked ? "הסתר" : "הצג"} לא ניתן לשבץ (
                      {hardBlocked.length}) ▾
                    </button>
                    {showHardBlocked && (
                      <ul className="space-y-1">
                        {hardBlocked.map((r) => {
                          const isManagerBlock =
                            r.reason === "חסום ידנית למשמרת זו";
                          return (
                            <li
                              key={r.employeeId}
                              className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"
                            >
                              <span className="text-slate-600">
                                {r.employeeName}
                              </span>
                              <span className="flex items-center gap-2">
                                <span className="text-xs text-slate-400">
                                  {r.reason}
                                </span>
                                {isManagerBlock && (
                                  <button
                                    type="button"
                                    onClick={() => unblock(r.employeeId)}
                                    disabled={isPending}
                                    className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-brand-600 hover:bg-brand-50"
                                  >
                                    בטל חסימה
                                  </button>
                                )}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="border-t border-slate-100 p-3 text-end">
            <Button variant="ghost" size="sm" onClick={onClose}>
              סגור
            </Button>
          </div>
        </div>
      </div>

      {/* Soft-override confirmation dialog */}
      {confirming && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
          onClick={() => setConfirming(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center gap-2 text-amber-700">
              <span className="text-xl">⚠</span>
              <h4 className="font-semibold">אישור שיבוץ עם אזהרה</h4>
            </div>
            <p className="text-sm text-slate-700">
              לשבץ את <span className="font-medium">{confirming.employeeName}</span>{" "}
              למשמרת זו?
            </p>
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {confirming.reason}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              השיבוץ יישמר ויינעל, וייכלל בייצוא ובהדפסה.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirming(null)}
              >
                ביטול
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  const id = confirming.employeeId;
                  setConfirming(null);
                  assign(id);
                }}
                disabled={isPending}
              >
                שבץ בכל זאת
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
