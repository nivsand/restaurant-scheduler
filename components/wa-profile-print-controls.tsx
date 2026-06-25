"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";

export function WaProfilePrintControls({ weekId }: { weekId: string }) {
  const params = useSearchParams();
  const autoFiredRef = useRef(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function capture(autoClose = false) {
    setError(null);
    setDownloading(true);
    try {
      const { toPng } = await import("html-to-image");
      const node = document.getElementById("wa-schedule");
      if (!node) throw new Error("אזור הסידור לא נמצא");

      const dataUrl = await toPng(node, {
        pixelRatio: 4,
        backgroundColor: "#ffffff",
        width: node.scrollWidth,
        height: node.scrollHeight,
        cacheBust: true,
      });

      const padded = await padToSquare(dataUrl);
      const link = document.createElement("a");
      link.download = `schedule-${weekId}-whatsapp-profile.png`;
      link.href = padded;
      link.click();
      setDone(true);
      if (autoClose) setTimeout(() => window.close(), 800);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDownloading(false);
    }
  }

  useEffect(() => {
    if (autoFiredRef.current) return;
    const auto = params.get("auto");
    if (auto !== "wa-profile") return;
    autoFiredRef.current = true;
    const handle = setTimeout(() => void capture(true), 400);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  return (
    <div className="flex flex-col items-start gap-1.5 print:hidden" data-no-export="true">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={() => void capture(false)}
          disabled={downloading}
          size="sm"
        >
          {downloading ? "מייצא..." : "📥 שמור תמונה לפרופיל WhatsApp"}
        </Button>
        {done && !downloading && (
          <span className="text-xs text-emerald-600">✓ הורד בהצלחה</span>
        )}
      </div>
      {error && <p className="text-xs text-rose-600">{error}</p>}
      <p className="text-xs text-brown-400">
        תמונה מרובעת ברזולוציה גבוהה · מתאימה לפרופיל קבוצת WhatsApp
      </p>
    </div>
  );
}

function padToSquare(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      // 14% padding so WhatsApp's circle crop stays in white space
      const pad = Math.round(Math.max(img.width, img.height) * 0.14);
      const side = Math.max(img.width, img.height) + pad * 2;
      const canvas = document.createElement("canvas");
      canvas.width = side;
      canvas.height = side;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("canvas unavailable")); return; }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, side, side);
      ctx.drawImage(img, Math.round((side - img.width) / 2), Math.round((side - img.height) / 2));
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("failed to load capture"));
    img.src = dataUrl;
  });
}
