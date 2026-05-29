import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type PdfBrowser = {
  newPage: () => Promise<{
    addStyleTag: (options: { content: string }) => Promise<unknown>;
    emulateMediaType: (type: "screen" | "print" | null) => Promise<void>;
    evaluate: <T>(pageFunction: () => T | Promise<T>) => Promise<T>;
    goto: (
      url: string,
      options: { timeout: number; waitUntil: "networkidle0" },
    ) => Promise<{ ok: () => boolean; status: () => number } | null>;
    pdf: (options: {
      format: "A4";
      landscape: boolean;
      preferCSSPageSize: boolean;
      printBackground: boolean;
    }) => Promise<Uint8Array>;
    setCookie: (
      ...cookies: Array<{
        name: string;
        path: string;
        url: string;
        value: string;
      }>
    ) => Promise<void>;
    setViewport: (viewport: {
      deviceScaleFactor: number;
      height: number;
      width: number;
    }) => Promise<void>;
    url: () => string;
    waitForFunction: (
      pageFunction: () => boolean,
      options: { timeout: number },
    ) => Promise<unknown>;
    waitForSelector: (
      selector: string,
      options: { timeout: number; visible: boolean },
    ) => Promise<unknown>;
  }>;
  close: () => Promise<void>;
};

function safeFilenamePart(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

async function launchPdfBrowser(): Promise<{
  browser: PdfBrowser;
  renderer: string;
}> {
  if (process.env.VERCEL) {
    const chromium = (await import("@sparticuz/chromium")).default;
    const puppeteerCore = (await import("puppeteer-core")).default;
    const executablePath = await chromium.executablePath();

    return {
      browser: (await puppeteerCore.launch({
        args: [
          ...chromium.args,
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--no-sandbox",
          "--disable-setuid-sandbox",
        ],
        defaultViewport: {
          deviceScaleFactor: 1,
          height: 1000,
          width: 1440,
        },
        executablePath,
        headless: "shell",
      })) as unknown as PdfBrowser,
      renderer: "puppeteer-core:@sparticuz/chromium",
    };
  }

  const puppeteer = (await import("puppeteer")).default;
  return {
    browser: (await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    })) as unknown as PdfBrowser,
    renderer: "puppeteer:bundled-chromium",
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ weekId: string }> },
) {
  const { weekId } = await params;
  const exportId = crypto.randomUUID();
  const session = await auth();
  const restaurantId = session?.user?.restaurantId;

  console.log(
    `[schedule-pdf-export] id=${exportId} path=/api/schedule/[weekId]/pdf status=start weekId=${weekId}`,
  );

  if (!session?.user?.id || !restaurantId) {
    console.warn(
      `[schedule-pdf-export] id=${exportId} status=unauthorized reason=no-session`,
    );
    return NextResponse.json(
      { error: "Unauthorized", exportId, path: "puppeteer-route" },
      {
        headers: { "x-schedule-pdf-export-path": "puppeteer-route" },
        status: 401,
      },
    );
  }

  const week = await prisma.week.findFirst({
    where: { id: weekId, restaurantId },
    select: { id: true },
  });

  if (!week) {
    console.warn(
      `[schedule-pdf-export] id=${exportId} status=not-found weekId=${weekId}`,
    );
    return NextResponse.json(
      { error: "Not found", exportId, path: "puppeteer-route" },
      {
        headers: { "x-schedule-pdf-export-path": "puppeteer-route" },
        status: 404,
      },
    );
  }

  const origin = request.nextUrl.origin;
  const printUrl = new URL(`/schedule/${weekId}/print?pdf=1`, origin);
  let browser: PdfBrowser | null = null;
  let renderer = "not-started";

  try {
    const launched = await launchPdfBrowser();
    browser = launched.browser;
    renderer = launched.renderer;
    console.log(
      `[schedule-pdf-export] id=${exportId} path=puppeteer-route renderer=${renderer} url=${printUrl.toString()}`,
    );

    const page = await browser.newPage();
    await page.setViewport({
      width: 1440,
      height: 1000,
      deviceScaleFactor: 1,
    });

    const cookies = request.cookies.getAll().map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      url: origin,
      path: "/",
    }));

    if (cookies.length > 0) await page.setCookie(...cookies);

    const response = await page.goto(printUrl.toString(), {
      waitUntil: "networkidle0",
      timeout: 60_000,
    });

    if (!response?.ok()) {
      throw new Error(
        `PDF page failed with status ${response?.status() ?? "unknown"}`,
      );
    }

    if (new URL(page.url()).pathname === "/login") {
      console.warn(
        `[schedule-pdf-export] id=${exportId} status=unauthorized reason=puppeteer-redirected-login`,
      );
      return NextResponse.json(
        { error: "Unauthorized", exportId, path: "puppeteer-route" },
        {
          headers: { "x-schedule-pdf-export-path": "puppeteer-route" },
          status: 401,
        },
      );
    }

    await page.waitForSelector("#schedule-area", {
      visible: true,
      timeout: 30_000,
    });
    await page.waitForFunction(
      () => {
        const cell = document.querySelector("#schedule-area tbody td:nth-child(2)");
        if (!cell) return false;
        return getComputedStyle(cell).backgroundColor !== "rgba(0, 0, 0, 0)";
      },
      { timeout: 30_000 },
    );
    await page.evaluate(() => document.fonts?.ready);
    await page.emulateMediaType("screen");
    await page.addStyleTag({
      content: `
        @page { size: A4 landscape; margin: 8mm; }
        html, body { direction: rtl; background: #fff !important; margin: 0 !important; }
        body:has(#schedule-area) * { visibility: hidden !important; }
        body:has(#schedule-area) #schedule-area,
        body:has(#schedule-area) #schedule-area * { visibility: visible !important; }
        body:has(#schedule-area) #schedule-area {
          position: absolute !important;
          inset: 0 0 auto 0 !important;
          margin: 0 !important;
          max-width: none !important;
          overflow: visible !important;
          width: 100% !important;
        }
        * {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        [data-no-export] { display: none !important; }
      `,
    });
    const styleProof = await page.evaluate(() => {
      const schedule = document.querySelector("#schedule-area");
      const firstCell = document.querySelector("#schedule-area tbody td:nth-child(2)");
      const header = document.querySelector("#schedule-area th");
      if (!schedule || !firstCell || !header) return null;
      const cellStyle = getComputedStyle(firstCell);
      const headerStyle = getComputedStyle(header);
      return {
        cellBackground: cellStyle.backgroundColor,
        cellBorder: `${cellStyle.borderTopColor} ${cellStyle.borderTopWidth}`,
        direction: getComputedStyle(schedule).direction,
        headerBackground: headerStyle.backgroundColor,
        headerBorder: `${headerStyle.borderTopColor} ${headerStyle.borderTopWidth}`,
      };
    });

    console.log(
      `[schedule-pdf-export] id=${exportId} style-proof=${JSON.stringify(styleProof)}`,
    );

    const pdf = await page.pdf({
      format: "A4",
      landscape: true,
      printBackground: true,
      preferCSSPageSize: true,
    });
    const body = pdf.buffer.slice(
      pdf.byteOffset,
      pdf.byteOffset + pdf.byteLength,
    ) as ArrayBuffer;

    return new NextResponse(body, {
      headers: {
        "x-schedule-pdf-export-id": exportId,
        "x-schedule-pdf-export-path": "puppeteer-route",
        "x-schedule-pdf-renderer": renderer,
        "x-schedule-pdf-style-cell-bg": styleProof?.cellBackground ?? "unknown",
        "x-schedule-pdf-style-direction": styleProof?.direction ?? "unknown",
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="schedule-${safeFilenamePart(weekId)}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error(
      `[schedule-pdf-export] id=${exportId} status=failed renderer=${renderer}`,
      error,
    );
    return NextResponse.json(
      {
        error: "PDF export failed",
        exportId,
        fallback: "html-to-image-png",
        path: "puppeteer-route",
      },
      {
        headers: {
          "x-schedule-pdf-export-id": exportId,
          "x-schedule-pdf-export-path": "puppeteer-route",
          "x-schedule-pdf-fallback": "html-to-image-png",
          "x-schedule-pdf-renderer": renderer,
        },
        status: 503,
      },
    );
  } finally {
    await browser?.close();
  }
}
