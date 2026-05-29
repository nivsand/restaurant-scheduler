"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { exportScheduleExcelAction } from "@/app/(app)/schedule/export-actions";

export function ExportWeekButtons({ weekId }: { weekId: string }) {
  const [downloading, setDownloading] = useState<"pdf" | "xlsx" | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function openPrint(auto: "png") {
    setError(null);
    window.open(`/schedule/${weekId}/print?auto=${auto}`, "_blank", "noopener");
  }

  async function downloadPdf() {
    setError(null);
    setDownloading("pdf");
    try {
      const response = await fetch(`/api/schedule/${weekId}/pdf`, {
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error("ייצוא PDF נכשל");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.download = `schedule-${weekId}.pdf`;
      a.href = url;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDownloading(null);
    }
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
      <Button
        variant="secondary"
        size="sm"
        onClick={downloadPdf}
        disabled={downloading === "pdf"}
      >
        {downloading === "pdf" ? "..." : "🖨 PDF"}
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
