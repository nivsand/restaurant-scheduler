"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { exportScheduleExcelAction } from "@/app/(app)/schedule/export-actions";

// Visible export row on the schedule editor itself. The print and image
// flows open the dedicated print page in a new tab (with ?auto=X) which
// renders cleanly then auto-triggers the action.
export function ScheduleExportRow({ weekId }: { weekId: string }) {
  const [downloading, setDownloading] = useState<"png" | "xlsx" | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function openPrint(auto: "print" | "png") {
    setError(null);
    const url = `/schedule/${weekId}/print?auto=${auto}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function downloadExcel() {
    setError(null);
    setDownloading("xlsx");
    startTransition(async () => {
      try {
        const b64 = await exportScheduleExcelAction(weekId);
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const blob = new Blob([bytes], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
        const a = document.createElement("a");
        a.download = `schedule-${weekId}.xlsx`;
        a.href = URL.createObjectURL(blob);
        a.click();
        URL.revokeObjectURL(a.href);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setDownloading(null);
      }
    });
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-base">📤</span>
        <h3 className="text-sm font-semibold text-slate-900">
          ייצוא ושיתוף
        </h3>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Button
          onClick={() => openPrint("print")}
          variant="secondary"
          className="justify-start"
        >
          <span className="text-base">🖨</span>
          <span>הדפסה / PDF</span>
        </Button>
        <Button
          onClick={() => openPrint("png")}
          variant="secondary"
          className="justify-start"
        >
          <span className="text-base">🖼</span>
          <span>תמונה ל-WhatsApp</span>
        </Button>
        <Button
          onClick={downloadExcel}
          variant="secondary"
          className="justify-start"
          disabled={downloading === "xlsx" || isPending}
        >
          <span className="text-base">📊</span>
          <span>{downloading === "xlsx" ? "מייצא..." : "Excel"}</span>
        </Button>
      </div>
      {error && (
        <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">
          {error}
        </div>
      )}
      <p className="mt-2 text-[11px] text-slate-400">
        ההדפסה והתמונה ייפתחו בלשונית חדשה עם תצוגה נקייה.
      </p>
    </div>
  );
}
