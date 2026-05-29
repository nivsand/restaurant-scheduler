"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { exportScheduleExcelAction } from "@/app/(app)/schedule/export-actions";

export function ExportWeekButtons({ weekId }: { weekId: string }) {
  const [downloading, setDownloading] = useState<"xlsx" | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function openPrint(auto: "print" | "png") {
    setError(null);
    window.open(`/schedule/${weekId}/print?auto=${auto}`, "_blank", "noopener");
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
    <div className="flex flex-wrap items-center gap-1">
      <Button variant="secondary" size="sm" onClick={() => openPrint("print")}>
        🖨 הדפסה
      </Button>
      <Button variant="secondary" size="sm" onClick={() => openPrint("png")}>
        🖼 תמונה
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={downloadExcel}
        disabled={downloading === "xlsx" || isPending}
      >
        {downloading === "xlsx" ? "..." : "📊 Excel"}
      </Button>
      {error && (
        <div className="basis-full text-xs text-rose-600">{error}</div>
      )}
    </div>
  );
}
