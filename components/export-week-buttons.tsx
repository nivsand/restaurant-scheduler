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

  function openWaProfile() {
    window.open(`/schedule/${weekId}/print/whatsapp?auto=wa-profile`, "_blank", "noopener");
  }

  async function downloadFallbackImage() {
    console.log("[schedule-pdf-export] client fallback=html-to-image-png start", {
      weekId,
    });
    const node = document.getElementById("schedule-area");
    if (!node) {
      const fallbackUrl = `/schedule/${weekId}/print?auto=png&fallback=pdf`;
      console.log("[schedule-pdf-export] client fallback=print-page-png", {
        fallbackUrl,
        weekId,
      });
      window.location.assign(fallbackUrl);
      return;
    }

    const { toPng } = await import("html-to-image");
    const dataUrl = await toPng(node, {
      pixelRatio: 2,
      backgroundColor: "#ffffff",
      width: node.scrollWidth,
      height: node.scrollHeight,
      cacheBust: true,
      filter: (el) => {
        if (!(el instanceof HTMLElement)) return true;
        return el.dataset.noExport !== "true";
      },
    });
    const a = document.createElement("a");
    a.download = `schedule-${weekId}.png`;
    a.href = dataUrl;
    a.click();
    console.log("[schedule-pdf-export] client fallback=html-to-image-png done", {
      weekId,
    });
  }

  async function downloadPdf() {
    setError(null);
    setDownloading("pdf");
    const endpoint = `/api/schedule/${weekId}/pdf`;
    console.log("[schedule-pdf-export] client path=puppeteer-route", {
      endpoint,
      weekId,
    });
    try {
      const response = await fetch(endpoint, {
        credentials: "same-origin",
      });
      console.log("[schedule-pdf-export] client response", {
        exportId: response.headers.get("x-schedule-pdf-export-id"),
        fallback: response.headers.get("x-schedule-pdf-fallback"),
        path: response.headers.get("x-schedule-pdf-export-path"),
        renderer: response.headers.get("x-schedule-pdf-renderer"),
        status: response.status,
        styleCellBg: response.headers.get("x-schedule-pdf-style-cell-bg"),
        styleDirection: response.headers.get("x-schedule-pdf-style-direction"),
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
      console.warn(
        "[schedule-pdf-export] client fallback=html-to-image-png",
        err,
      );
      try {
        await downloadFallbackImage();
      } catch (fallbackErr) {
        console.warn(
          "[schedule-pdf-export] client fallback=html-to-image-png failed",
          fallbackErr,
        );
        setError((fallbackErr as Error).message);
      }
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
        onClick={openWaProfile}
        title="עמוד ייצוא מיוחד עם פונט גדול לפרופיל קבוצת WhatsApp"
      >
        📸 פרופיל
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
