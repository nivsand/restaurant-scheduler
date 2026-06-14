"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { exportScheduleExcelAction } from "@/app/(app)/schedule/export-actions";

export function PrintControls({ weekId }: { weekId: string }) {
  const params = useSearchParams();
  const [downloading, setDownloading] = useState<"pdf" | "png" | "xlsx" | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const autoFiredRef = useRef(false);

  async function downloadPdf(autoClose = false) {
    setError(null);
    setDownloading("pdf");
    const endpoint = `/api/schedule/${weekId}/pdf`;
    console.log("[schedule-pdf-export] client path=puppeteer-route", {
      autoClose,
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
      const link = document.createElement("a");
      link.download = `schedule-${weekId}.pdf`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
      if (autoClose) setTimeout(() => window.close(), 500);
    } catch (err) {
      console.warn(
        "[schedule-pdf-export] client fallback=html-to-image-png",
        err,
      );
      setError((err as Error).message);
      await downloadPng(autoClose);
    } finally {
      setDownloading(null);
    }
  }

  async function downloadPng(autoClose = false) {
    setError(null);
    setDownloading("png");
    console.log("[schedule-pdf-export] client fallback=html-to-image-png start", {
      autoClose,
      weekId,
    });
    try {
      const { toPng } = await import("html-to-image");
      // Target the schedule grid only — NOT the summary section. This avoids
      // the long-tall cropped image the user reported and keeps the PNG
      // WhatsApp-friendly.
      const node = document.getElementById("schedule-area");
      if (!node) throw new Error("לא נמצא אזור הסידור");
      // Use the natural scrollWidth/scrollHeight so wide grids aren't cropped
      const dataUrl = await toPng(node, {
        pixelRatio: 3,
        backgroundColor: "#ffffff",
        width: node.scrollWidth,
        height: node.scrollHeight,
        cacheBust: true,
        filter: (el) => {
          if (!(el instanceof HTMLElement)) return true;
          return el.dataset.noExport !== "true";
        },
      });
      const link = document.createElement("a");
      link.download = `schedule-${weekId}.png`;
      link.href = dataUrl;
      link.click();
      console.log("[schedule-pdf-export] client fallback=html-to-image-png done", {
        autoClose,
        weekId,
      });
      if (autoClose) setTimeout(() => window.close(), 500);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDownloading(null);
    }
  }

  // Auto-trigger handler: ?auto=pdf uses the Puppeteer API route; ?auto=png uses html-to-image.
  useEffect(() => {
    if (autoFiredRef.current) return;
    const auto = params.get("auto");
    if (!auto) return;
    autoFiredRef.current = true;
    // Wait one tick so the page has rendered fonts + layout
    const handle = setTimeout(() => {
      if (auto === "print") {
        console.warn("[schedule-pdf-export] client legacy-auto-print=disabled", {
          weekId,
        });
      } else if (auto === "pdf") void downloadPdf(true);
      else if (auto === "png") void downloadPng(true);
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  function downloadExcel() {
    setError(null);
    setDownloading("xlsx");
    startTransition(async () => {
      try {
        const buffer = await exportScheduleExcelAction(weekId);
        // buffer is a base64 string for safe transit through server actions
        const bin = atob(buffer);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const blob = new Blob([bytes], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.download = `schedule-${weekId}.xlsx`;
        link.href = url;
        link.click();
        URL.revokeObjectURL(url);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setDownloading(null);
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => downloadPdf(false)}
          variant="secondary"
          size="sm"
          disabled={downloading === "pdf"}
        >
          {downloading === "pdf" ? "מייצא..." : "🖨 PDF"}
        </Button>
        <Button
          onClick={() => downloadPng(false)}
          variant="secondary"
          size="sm"
          disabled={downloading === "png"}
        >
          {downloading === "png" ? "מייצא..." : "🖼 שמירה כתמונה"}
        </Button>
        <Button
          onClick={downloadExcel}
          variant="secondary"
          size="sm"
          disabled={downloading === "xlsx" || isPending}
        >
          {downloading === "xlsx" ? "מייצא..." : "📊 ייצוא ל-Excel"}
        </Button>
      </div>
      {error && (
        <div className="text-xs text-rose-600">{error}</div>
      )}
    </div>
  );
}
