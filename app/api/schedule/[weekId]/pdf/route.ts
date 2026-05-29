import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeFilenamePart(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ weekId: string }> },
) {
  const { weekId } = await params;
  const session = await auth();
  const restaurantId = session?.user?.restaurantId;

  if (!session?.user?.id || !restaurantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const week = await prisma.week.findFirst({
    where: { id: weekId, restaurantId },
    select: { id: true },
  });

  if (!week) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const origin = request.nextUrl.origin;
  const printUrl = new URL(`/schedule/${weekId}/print?pdf=1`, origin);
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
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
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });

    if (!response?.ok()) {
      throw new Error(
        `PDF page failed with status ${response?.status() ?? "unknown"}`,
      );
    }

    if (new URL(page.url()).pathname === "/login") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await page.waitForSelector("#schedule-area", {
      visible: true,
      timeout: 30_000,
    });
    await page.evaluate(() => document.fonts?.ready);
    await page.emulateMediaType("print");
    await page.addStyleTag({
      content: `
        @page { size: A4 landscape; margin: 8mm; }
        html, body { direction: rtl; background: #fff !important; }
        * {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        [data-no-export] { display: none !important; }
      `,
    });

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
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="schedule-${safeFilenamePart(weekId)}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } finally {
    await browser.close();
  }
}
