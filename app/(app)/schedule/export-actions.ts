"use server";

import ExcelJS from "exceljs";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatWeekRange } from "@/lib/week";
import { DAYS, DAY_NAMES_HE } from "@/lib/days";
import {
  ALL_SHIFT_TYPES,
  SHIFT_DEFS,
  ShiftType,
  FRIDAY_FLOOR_SPLIT_DAY,
  FRIDAY_FLOOR_SPLIT_SHIFT_TYPE,
  FRIDAY_FLOOR_SPLIT_DEFAULT_TIMES,
} from "@/lib/shifts";

// Excel ARGB colors (alpha first). Matches the on-screen theme.
const COLOR = {
  ORANGE: "FFFED7AA",     // kitchen
  BLUE: "FFBAE6FD",       // floor morning
  GREEN: "FFA7F3D0",      // floor evening / closing
  VIOLET: "FFDDD6FE",     // events
  PURPLE: "FFE9D5FF",     // shift manager
  LIME: "FFD9F99D",       // hours
  ROSE: "FFFECACA",       // closed
  HEADER: "FFE2E8F0",     // header gray
  LABEL_BOLD: "FF1E293B", // text on label cells
} as const;

function fillFor(shiftType: ShiftType): string {
  switch (shiftType) {
    case "MORNING_KITCHEN":
    case "EVENING_KITCHEN":
      return COLOR.ORANGE;
    case "MORNING_FLOOR":
      return COLOR.BLUE;
    case "EVENING_FLOOR_17":
    case "CLOSING_A_19":
    case "CLOSING_B_20":
      return COLOR.GREEN;
    default:
      return COLOR.GREEN;
  }
}

const NOTE_ROWS = [
  { kind: "event", labelHe: "אירועים", fill: COLOR.VIOLET },
  { kind: "shift_manager", labelHe: "מנהל/ת משמרת", fill: COLOR.PURPLE },
  { kind: "hours", labelHe: "שעות", fill: COLOR.LIME },
] as const;

const ALL_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin" },
  bottom: { style: "thin" },
  left: { style: "thin" },
  right: { style: "thin" },
};

function styleCell(
  cell: ExcelJS.Cell,
  argb: string,
  opts: { bold?: boolean; wrap?: boolean } = {},
) {
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb },
  };
  cell.alignment = {
    vertical: "middle",
    horizontal: "center",
    wrapText: opts.wrap ?? true,
  };
  cell.border = ALL_BORDER;
  if (opts.bold) cell.font = { bold: true };
}

export async function exportScheduleExcelAction(weekId: string): Promise<string> {
  const { restaurantId } = await requireAuth();

  const week = await prisma.week.findFirst({
    where: { id: weekId, restaurantId },
    include: { restaurant: true, overrides: true },
  });
  if (!week) throw new Error("שבוע לא נמצא");

  const [templates, assignments, employees, scheduleNotes, submissions, parsed] =
    await Promise.all([
      prisma.shiftTemplate.findMany({ where: { restaurantId } }),
      prisma.scheduleAssignment.findMany({
        where: { weekId },
        include: { employee: true },
      }),
      prisma.employee.findMany({
        where: { restaurantId, archived: false },
        orderBy: { name: "asc" },
      }),
      prisma.scheduleNote.findMany({ where: { weekId } }),
      prisma.rawSubmission.findMany({
        where: { weekId, employeeId: { not: null } },
        orderBy: { submittedAt: "desc" },
      }),
      prisma.parsedAvailability.findMany({
        where: { weekId, confirmed: true },
      }),
    ]);

  const headMap = new Map<string, number>();
  for (const t of templates) headMap.set(`${t.day}:${t.shiftType}`, t.headcount);
  for (const o of week.overrides) headMap.set(`${o.day}:${o.shiftType}`, o.headcount);

  const availabilityNoteMap = new Map<string, string>();
  for (const row of parsed) {
    const note = row.note?.trim();
    if (!note) continue;
    availabilityNoteMap.set(
      `${row.employeeId}:${row.day}:${row.shiftType}`,
      note,
    );
  }

  const cellMap = new Map<string, Array<string | null>>();
  for (const [k, n] of headMap) if (n > 0) cellMap.set(k, new Array(n).fill(null));
  for (const a of assignments) {
    const key = `${a.day}:${a.shiftType}`;
    if (!cellMap.has(key)) continue;
    const name = a.employee?.name ?? null;
    const note = a.employeeId
      ? availabilityNoteMap.get(`${a.employeeId}:${a.day}:${a.shiftType}`) ?? null
      : null;
    cellMap.get(key)![a.slotIndex] = name && note ? `${name}\n${note}` : name;
  }

  const noteMap = new Map<string, string>();
  for (const n of scheduleNotes) noteMap.set(`${n.day}:${n.kind}`, n.content);

  // Friday "פלור בוקר" split-cell start times (per-week override or default).
  const fridayFloorSplitTimes: [string, string] = [
    noteMap.get(`${FRIDAY_FLOOR_SPLIT_DAY}:floor_split_0`) ??
      FRIDAY_FLOOR_SPLIT_DEFAULT_TIMES[0],
    noteMap.get(`${FRIDAY_FLOOR_SPLIT_DAY}:floor_split_1`) ??
      FRIDAY_FLOOR_SPLIT_DEFAULT_TIMES[1],
  ];

  const activeShiftTypes = ALL_SHIFT_TYPES.filter((st) => {
    for (const d of DAYS) if ((headMap.get(`${d}:${st}`) ?? 0) > 0) return true;
    return false;
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = "Shift Scheduler";
  wb.created = new Date();

  // ── Sheet 1: Schedule grid ──────────────────────────────────────────────
  const ws = wb.addWorksheet("סידור", {
    views: [{ rightToLeft: true, state: "frozen", ySplit: 3 }],
    pageSetup: { orientation: "landscape", paperSize: 9, fitToPage: true },
  });

  ws.mergeCells(1, 1, 1, 8);
  const title = ws.getCell(1, 1);
  title.value = `${week.restaurant.name} — סידור עבודה — ${formatWeekRange(week.weekStart)}`;
  title.font = { bold: true, size: 14 };
  title.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = 26;

  // Header row (row 3): "משמרת" + 7 days
  const headerRow = ws.getRow(3);
  headerRow.values = ["משמרת", ...DAYS.map((d) => DAY_NAMES_HE[d])];
  headerRow.eachCell((cell) => styleCell(cell, COLOR.HEADER, { bold: true }));
  headerRow.height = 22;
  ws.getColumn(1).width = 28;
  for (let i = 2; i <= 8; i++) ws.getColumn(i).width = 22;

  // Shift rows
  let rowIdx = 4;
  for (const st of activeShiftTypes) {
    const def = SHIFT_DEFS[st];
    const fill = fillFor(st);
    const row = ws.getRow(rowIdx);
    row.values = [
      `${def.labelHe}\n${def.start}-${def.end}`,
      ...DAYS.map((d) => {
        const need = headMap.get(`${d}:${st}`) ?? 0;
        if (need === 0) return "סגור";
        const cells = cellMap.get(`${d}:${st}`) ?? [];
        // Friday "פלור בוקר" split: two employees, each with their own start
        // time, separated by a divider line. Falls back to the normal list
        // when fewer than two employees are assigned.
        if (
          d === FRIDAY_FLOOR_SPLIT_DAY &&
          st === FRIDAY_FLOOR_SPLIT_SHIFT_TYPE &&
          cells.length === 2 &&
          cells[0] &&
          cells[1]
        ) {
          return [
            `${cells[0]} (${fridayFloorSplitTimes[0]})`,
            "────────",
            `${cells[1]} (${fridayFloorSplitTimes[1]})`,
          ].join("\n");
        }
        return cells.map((n) => n ?? "— ריק —").join("\n");
      }),
    ];
    row.eachCell((cell, col) => {
      if (col === 1) {
        // Label cell — same color, bold
        styleCell(cell, fill, { bold: true });
      } else {
        const dayIndex = col - 2;
        const need = headMap.get(`${dayIndex}:${st}`) ?? 0;
        styleCell(cell, need === 0 ? COLOR.ROSE : fill, {
          bold: need === 0,
        });
      }
    });
    // Compute row height from max line count
    const maxLines = Math.max(
      ...DAYS.map((d) => {
        const need = headMap.get(`${d}:${st}`) ?? 0;
        if (need === 0) return 1;
        const cells = cellMap.get(`${d}:${st}`) ?? [];
        return Math.max(
          1,
          cells.reduce(
            (sum, value) => sum + (value ? value.split("\n").length : 1),
            0,
          ),
        );
      }),
      2,
    );
    row.height = Math.max(22, maxLines * 14);
    rowIdx += 1;
  }

  // Note rows
  for (const { kind, labelHe, fill } of NOTE_ROWS) {
    const row = ws.getRow(rowIdx);
    row.values = [
      labelHe,
      ...DAYS.map((d) => noteMap.get(`${d}:${kind}`) ?? ""),
    ];
    row.eachCell((cell, col) => {
      styleCell(cell, fill, { bold: col === 1 });
    });
    row.height = 24;
    rowIdx += 1;
  }

  // ── Sheet 2: Per-employee summary (8 columns) ──────────────────────────
  const ws2 = wb.addWorksheet("סיכום עובדים", {
    views: [{ rightToLeft: true }],
  });

  ws2.getRow(1).values = [
    "עובד",
    "מבוקש",
    "שובץ",
    "בוקר",
    "ערב",
    "סגירות",
    "סופ״ש",
    "הערות",
  ];
  ws2.getRow(1).eachCell((cell) =>
    styleCell(cell, COLOR.HEADER, { bold: true }),
  );
  ws2.getRow(1).height = 22;

  ws2.getColumn(1).width = 22;
  for (let i = 2; i <= 7; i++) ws2.getColumn(i).width = 12;
  ws2.getColumn(8).width = 28;

  // Latest requested-shifts per employee
  const requestedByEmp = new Map<string, number | null>();
  for (const s of submissions) {
    if (!s.employeeId) continue;
    if (requestedByEmp.has(s.employeeId)) continue;
    requestedByEmp.set(s.employeeId, s.requestedShifts);
  }

  // Aggregate per employee
  const empMap = new Map(employees.map((e) => [e.id, e]));
  const stats = new Map<
    string,
    {
      name: string;
      total: number;
      mornings: number;
      evenings: number;
      closings: number;
      weekends: number;
      noClosings: boolean;
    }
  >();
  for (const a of assignments) {
    if (!a.employeeId || !a.employee) continue;
    const def = SHIFT_DEFS[a.shiftType as ShiftType];
    if (!def) continue;
    const emp = empMap.get(a.employeeId);
    const c =
      stats.get(a.employeeId) ?? {
        name: a.employee.name,
        total: 0,
        mornings: 0,
        evenings: 0,
        closings: 0,
        weekends: 0,
        noClosings: emp?.noClosings ?? false,
      };
    c.total += 1;
    if (def.start < "12:00") c.mornings += 1;
    else c.evenings += 1;
    if (def.isClosing) c.closings += 1;
    if (a.day === 5 || a.day === 6) c.weekends += 1;
    stats.set(a.employeeId, c);
  }

  let r = 2;
  for (const [eid, c] of Array.from(stats.entries()).sort(([, a], [, b]) =>
    a.name.localeCompare(b.name, "he"),
  )) {
    const req = requestedByEmp.get(eid);
    const notes: string[] = [];
    if (req != null && c.total < req) notes.push(`חסר ${req - c.total}`);
    if (req != null && c.total > req) notes.push(`עודף ${c.total - req}`);
    if (c.noClosings && c.closings > 0) notes.push("סגירה למרות העדפה");
    ws2.getRow(r).values = [
      c.name,
      req ?? "",
      c.total,
      c.mornings || "",
      c.evenings || "",
      c.closings || "",
      c.weekends || "",
      notes.join(" · ") || "",
    ];
    ws2.getRow(r).eachCell((cell, col) => {
      styleCell(cell, col === 1 ? COLOR.HEADER : "FFFFFFFF", {
        bold: col === 1 || col === 3,
        wrap: col === 8,
      });
    });
    ws2.getRow(r).height = 18;
    r += 1;
  }

  const buf = await wb.xlsx.writeBuffer();
  const u8 = new Uint8Array(buf as ArrayBuffer);
  let binary = "";
  for (let i = 0; i < u8.length; i++) binary += String.fromCharCode(u8[i]);
  return Buffer.from(binary, "binary").toString("base64");
}

// Type-only re-export so the old "use server" file still works for callers
export type ExportShiftType = ShiftType;
