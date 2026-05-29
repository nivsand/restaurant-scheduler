"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  setManagerActiveAction,
  deleteManagerAction,
} from "@/app/(app)/users/actions";

export function ManagerRowActions({
  id,
  active,
  isSelf,
}: {
  id: string;
  active: boolean;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleActive() {
    setError(null);
    startTransition(async () => {
      try {
        await setManagerActiveAction(id, !active);
        router.refresh();
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  function doDelete() {
    setError(null);
    startTransition(async () => {
      try {
        await deleteManagerAction(id);
        // deleteManagerAction redirects on success; refresh as a fallback.
        router.refresh();
      } catch (err) {
        setError((err as Error).message);
        setConfirmingDelete(false);
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center justify-end gap-1">
        <Link href={`/users/${id}`}>
          <Button variant="ghost" size="sm">
            ערוך
          </Button>
        </Link>
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleActive}
          disabled={isPending || isSelf}
          title={isSelf ? "לא ניתן להשבית את עצמך" : undefined}
        >
          {active ? "השבת" : "הפעל"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-rose-600 hover:bg-rose-50"
          onClick={() => setConfirmingDelete(true)}
          disabled={isPending || isSelf}
          title={isSelf ? "לא ניתן למחוק את עצמך" : undefined}
        >
          מחק
        </Button>
      </div>
      {error && <div className="text-xs text-rose-600">{error}</div>}

      {confirmingDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
          onClick={() => setConfirmingDelete(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="font-semibold text-slate-900">מחיקת משתמש</h4>
            <p className="mt-2 text-sm text-slate-600">
              הפעולה תמחק את חשבון המנהל/ת לצמיתות. אם ברצונך לשמור את היסטוריית
              הפעולות, השתמש/י ב״השבת״ במקום.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmingDelete(false)}
              >
                ביטול
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={doDelete}
                disabled={isPending}
              >
                {isPending ? "מוחק..." : "מחק לצמיתות"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
