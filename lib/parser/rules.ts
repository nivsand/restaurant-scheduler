// Rule-based parser. Reads normalized lines, emits ParsedLine + global aggregate.

import { DayOfWeek } from "@/lib/days";
import { SHIFT_TYPES, ShiftType, SHIFT_DEFS } from "@/lib/shifts";
import {
  DayMatch,
  ParsedLine,
  ParsedMessage,
  ParsedModifier,
  ShiftFamily,
  ShiftMatch,
  SpecialToken,
} from "./types";
import { extractEmojis, splitLines } from "./normalize";

// ─── Day dictionary ─────────────────────────────────────────────────────────
// Order matters: longer / more-specific entries first within each day.
// `regex` MUST be anchored so it doesn't accidentally match inside another word.

interface DayEntry {
  day: DayOfWeek;
  // Each pattern paired with the confidence it conveys when matched.
  patterns: Array<{ re: RegExp; conf: number; label: string }>;
}

// Build a regex that matches `word` when surrounded by start/end or non-word
// chars. For Hebrew letters we treat the Hebrew block as "word".
function he(word: string): RegExp {
  // (?<![א-ת\w]) and (?![א-ת\w]) act as Hebrew/Latin word boundaries.
  return new RegExp(
    `(?<![\\u05D0-\\u05EA\\w])${word}(?![\\u05D0-\\u05EA\\w])`,
    "i",
  );
}
function en(word: string): RegExp {
  return new RegExp(`\\b${word}\\b`, "i");
}

const DAY_TABLE: DayEntry[] = [
  {
    day: 0,
    patterns: [
      { re: he("יום ראשון"), conf: 1.0, label: "יום ראשון" },
      { re: he("ראשון"), conf: 1.0, label: "ראשון" },
      { re: he("יום א'"), conf: 0.9, label: "יום א'" },
      { re: he("יום א"), conf: 0.85, label: "יום א" },
      { re: he("א'"), conf: 0.8, label: "א'" },
      { re: en("sunday"), conf: 1.0, label: "Sunday" },
      { re: en("sun"), conf: 0.85, label: "Sun" },
    ],
  },
  {
    day: 1,
    patterns: [
      { re: he("יום שני"), conf: 1.0, label: "יום שני" },
      { re: he("שני"), conf: 0.95, label: "שני" }, // could conflict with "שני משמרות"; line-level dedupe handles
      { re: he("יום ב'"), conf: 0.9, label: "יום ב'" },
      { re: he("יום ב"), conf: 0.85, label: "יום ב" },
      { re: he("ב'"), conf: 0.75, label: "ב'" },
      { re: en("monday"), conf: 1.0, label: "Monday" },
      { re: en("mon"), conf: 0.85, label: "Mon" },
    ],
  },
  {
    day: 2,
    patterns: [
      { re: he("יום שלישי"), conf: 1.0, label: "יום שלישי" },
      { re: he("שלישי"), conf: 1.0, label: "שלישי" },
      { re: he("יום ג'"), conf: 0.9, label: "יום ג'" },
      { re: he("יום ג"), conf: 0.85, label: "יום ג" },
      { re: he("ג'"), conf: 0.8, label: "ג'" },
      { re: en("tuesday"), conf: 1.0, label: "Tuesday" },
      { re: en("tue"), conf: 0.85, label: "Tue" },
      { re: en("tues"), conf: 0.9, label: "Tues" },
    ],
  },
  {
    day: 3,
    patterns: [
      { re: he("יום רביעי"), conf: 1.0, label: "יום רביעי" },
      { re: he("רביעי"), conf: 1.0, label: "רביעי" },
      { re: he("יום ד'"), conf: 0.9, label: "יום ד'" },
      { re: he("יום ד"), conf: 0.85, label: "יום ד" },
      { re: he("ד'"), conf: 0.8, label: "ד'" },
      { re: en("wednesday"), conf: 1.0, label: "Wednesday" },
      { re: en("wed"), conf: 0.85, label: "Wed" },
    ],
  },
  {
    day: 4,
    patterns: [
      { re: he("יום חמישי"), conf: 1.0, label: "יום חמישי" },
      { re: he("חמישי"), conf: 1.0, label: "חמישי" },
      { re: he("יום ה'"), conf: 0.9, label: "יום ה'" },
      { re: he("יום ה"), conf: 0.85, label: "יום ה" },
      { re: he("ה'"), conf: 0.75, label: "ה'" },
      { re: en("thursday"), conf: 1.0, label: "Thursday" },
      { re: en("thu"), conf: 0.85, label: "Thu" },
      { re: en("thurs"), conf: 0.9, label: "Thurs" },
    ],
  },
  {
    day: 5,
    patterns: [
      { re: he("יום שישי"), conf: 1.0, label: "יום שישי" },
      { re: he("שישי"), conf: 1.0, label: "שישי" },
      { re: he("יום ו'"), conf: 0.9, label: "יום ו'" },
      { re: he("יום ו"), conf: 0.85, label: "יום ו" },
      { re: he("ו'"), conf: 0.7, label: "ו'" },
      { re: en("friday"), conf: 1.0, label: "Friday" },
      { re: en("fri"), conf: 0.85, label: "Fri" },
    ],
  },
  {
    day: 6,
    patterns: [
      { re: he("יום שבת"), conf: 1.0, label: "יום שבת" },
      { re: he("שבת"), conf: 0.9, label: "שבת" }, // venue is closed → caller decides
      { re: en("saturday"), conf: 1.0, label: "Saturday" },
      { re: en("sat"), conf: 0.85, label: "Sat" },
    ],
  },
];

// ─── Shift dictionary ──────────────────────────────────────────────────────

interface ShiftEntry {
  family: ShiftFamily;
  specific?: ShiftType[];
  patterns: Array<{ re: RegExp; conf: number; label: string }>;
}

const SHIFT_TABLE: ShiftEntry[] = [
  // "morning/evening" or "evening/morning" → either-or flexibility
  {
    family: "morningOrEvening",
    patterns: [
      { re: /בוקר\s*\/\s*ערב|ערב\s*\/\s*בוקר/i, conf: 0.95, label: "בוקר/ערב" },
      { re: /morning\s*\/\s*evening|evening\s*\/\s*morning/i, conf: 0.95, label: "morning/evening" },
    ],
  },
  {
    family: "morning",
    patterns: [
      { re: he("בוקר"), conf: 1.0, label: "בוקר" },
      { re: he("בקרים"), conf: 0.95, label: "בקרים" },
      { re: en("morning"), conf: 1.0, label: "morning" },
      { re: en("mornings"), conf: 0.95, label: "mornings" },
      { re: en("am"), conf: 0.7, label: "AM" },
    ],
  },
  {
    family: "evening",
    patterns: [
      { re: he("ערב"), conf: 1.0, label: "ערב" },
      { re: he("ערבים"), conf: 0.95, label: "ערבים" },
      { re: en("evening"), conf: 1.0, label: "evening" },
      { re: en("evenings"), conf: 0.95, label: "evenings" },
      { re: en("night"), conf: 0.85, label: "night" },
      { re: en("pm"), conf: 0.7, label: "PM" },
    ],
  },
  {
    family: "opening",
    patterns: [
      { re: he("פתיחה"), conf: 0.95, label: "פתיחה" },
      { re: en("opening"), conf: 0.95, label: "opening" },
    ],
  },
  {
    family: "closing",
    patterns: [
      { re: he("סגירה"), conf: 0.95, label: "סגירה" },
      { re: en("closing"), conf: 0.95, label: "closing" },
      { re: en("close"), conf: 0.85, label: "close" },
    ],
  },
  {
    family: "any",
    patterns: [
      { re: he("כל היום"), conf: 0.95, label: "כל היום" },
      { re: en("all day"), conf: 0.95, label: "all day" },
      { re: en("any"), conf: 0.7, label: "any" },
    ],
  },
];

// ─── Modifier dictionary ───────────────────────────────────────────────────

const TIME_RE = /(?<!\d)(\d{1,2})(?::(\d{2}))?/g;

const MODIFIER_TABLE: Array<{
  kind: ParsedModifier["kind"];
  patterns: RegExp[];
}> = [
  {
    kind: "fromTime",
    patterns: [/מ-?\s*\d{1,2}(?::\d{2})?/i, /\bfrom\s*\d{1,2}(?::\d{2})?/i, /\barrive\s*\d{1,2}(?::\d{2})?/i, /מגיע\s*ה?\s*\d{1,2}(?::\d{2})?/i],
  },
  {
    kind: "untilTime",
    patterns: [/עד\s*\d{1,2}(?::\d{2})?/i, /\buntil\s*\d{1,2}(?::\d{2})?/i, /\btill\s*\d{1,2}(?::\d{2})?/i],
  },
  {
    kind: "shiftCount",
    patterns: [/(\d+)\s*משמרות/i, /(\d+)\s*shifts?/i],
  },
  {
    kind: "minShiftCount",
    patterns: [/לפחות\s*(\d+)/i, /\bat least\s*(\d+)/i, /\bmin\s*(\d+)/i],
  },
  {
    kind: "preferEvenings",
    patterns: [/רק\s*ערבים/i, /\bonly\s*evenings/i, /evenings only/i],
  },
  {
    kind: "preferMornings",
    patterns: [/רק\s*בקרים|רק\s*בוקר/i, /\bonly\s*mornings/i, /mornings only/i],
  },
  {
    kind: "noClosings",
    patterns: [/בלי\s*סגירות?|לא\s*סגירות?/i, /\bno\s*closings?/i],
  },
];

// ─── Special token dictionary ──────────────────────────────────────────────

const SPECIAL_TABLE: Array<{
  kind: SpecialToken["kind"];
  patterns: RegExp[];
  conf: number;
}> = [
  { kind: "motzash", patterns: [he("מוצש"), he("מוצ\"ש"), he("מוצאי שבת")], conf: 0.55 },
  { kind: "shishi_shabbat", patterns: [/שישי\s*שבת/, /שש\b/], conf: 0.6 },
  { kind: "weekend", patterns: [en("weekend")], conf: 0.7 },
  { kind: "kol_hayom", patterns: [he("כל היום"), en("all day")], conf: 0.95 },
];

// ─── Per-line parser ───────────────────────────────────────────────────────

function findDayMatches(normalized: string): DayMatch[] {
  const found: DayMatch[] = [];
  const claimed = new Set<DayOfWeek>();
  for (const entry of DAY_TABLE) {
    if (claimed.has(entry.day)) continue;
    for (const p of entry.patterns) {
      if (p.re.test(normalized)) {
        found.push({ day: entry.day, source: p.label, confidence: p.conf });
        claimed.add(entry.day);
        break;
      }
    }
  }
  return found;
}

function findShiftMatches(normalized: string): ShiftMatch[] {
  const found: ShiftMatch[] = [];
  // Test "morningOrEvening" first since it would also match individual morning/evening regexes
  for (const entry of SHIFT_TABLE) {
    for (const p of entry.patterns) {
      if (p.re.test(normalized)) {
        // If we already added morningOrEvening, don't also add the individual morning/evening
        if (
          (entry.family === "morning" || entry.family === "evening") &&
          found.some((f) => f.family === "morningOrEvening")
        ) {
          continue;
        }
        found.push({
          family: entry.family,
          specificShifts: entry.specific,
          isEitherOr: entry.family === "morningOrEvening",
          source: p.label,
          confidence: p.conf,
        });
        break;
      }
    }
  }
  return found;
}

function findModifiers(normalized: string): ParsedModifier[] {
  const found: ParsedModifier[] = [];
  for (const entry of MODIFIER_TABLE) {
    for (const re of entry.patterns) {
      const m = normalized.match(re);
      if (m) {
        let value: string | number | undefined;
        if (entry.kind === "shiftCount" || entry.kind === "minShiftCount") {
          const num = parseInt(m[1] ?? m[0].match(/\d+/)?.[0] ?? "0", 10);
          value = num;
        } else if (
          entry.kind === "fromTime" ||
          entry.kind === "untilTime" ||
          entry.kind === "arriveTime"
        ) {
          const timeMatch = m[0].match(/\d{1,2}(?::\d{2})?/);
          value = timeMatch?.[0] ?? "";
        }
        found.push({ kind: entry.kind, value, source: m[0] });
        break;
      }
    }
  }
  return found;
}

function findSpecial(normalized: string): SpecialToken[] {
  const found: SpecialToken[] = [];
  for (const entry of SPECIAL_TABLE) {
    for (const re of entry.patterns) {
      if (re.test(normalized)) {
        found.push({ kind: entry.kind, source: re.source, confidence: entry.conf });
        break;
      }
    }
  }
  return found;
}

// Determine line-level confidence and whether LLM fallback is needed.
function scoreLine(line: ParsedLine): { confidence: number; needsLlm: boolean } {
  const notes: string[] = [];

  // No day at all and no special token → can't decide anything → low confidence.
  if (line.dayMatches.length === 0 && line.specialTokens.length === 0) {
    return { confidence: 0.2, needsLlm: true };
  }

  // Multiple days on one line → suspicious.
  if (line.dayMatches.length > 1) {
    notes.push("מספר ימים בשורה");
  }

  // Day but no shift → assume whole day, lower confidence slightly.
  let conf = 0;
  if (line.dayMatches.length > 0) {
    conf = line.dayMatches[0].confidence;
  }
  if (line.shiftMatches.length === 0 && line.dayMatches.length > 0) {
    conf = Math.min(conf, 0.7); // "ראשון" alone = any shift Sunday
  } else if (line.shiftMatches.length > 0) {
    conf = Math.min(conf, line.shiftMatches[0].confidence);
  }

  // Modifiers can override shift family — that's high signal, not low.
  // From-time later than 18:00 implies closing → bumps specificity.
  const fromTime = line.modifiers.find((m) => m.kind === "fromTime");
  if (fromTime && typeof fromTime.value === "string") {
    const hour = parseInt(fromTime.value.split(":")[0] ?? "0", 10);
    if (hour >= 19) {
      // confident: closings only
      conf = Math.max(conf, 0.85);
    } else if (hour >= 16) {
      // confident: late evening — could be 17:00 or closing
      conf = Math.max(conf, 0.7);
    }
  }

  // Special tokens that we can't map cleanly should be flagged.
  const hasMotzash = line.specialTokens.some((s) => s.kind === "motzash");
  const hasShishiShabbat = line.specialTokens.some((s) => s.kind === "shishi_shabbat");
  if (hasMotzash) {
    conf = Math.min(conf || 0.55, 0.55);
  }
  if (hasShishiShabbat) {
    conf = Math.min(conf || 0.6, 0.6);
  }

  // Conflicting: "morning AND evening on same day" without slash → can't double-shift.
  const hasMorning = line.shiftMatches.some((s) => s.family === "morning");
  const hasEvening = line.shiftMatches.some((s) => s.family === "evening");
  if (hasMorning && hasEvening && !line.shiftMatches.some((s) => s.isEitherOr)) {
    conf = Math.min(conf, 0.5);
    notes.push("בוקר וערב באותו יום");
  }

  line.notes.push(...notes);
  return { confidence: conf, needsLlm: conf < 0.5 };
}

export function parseLine(raw: string, normalized: string): ParsedLine {
  const line: ParsedLine = {
    raw,
    normalized,
    dayMatches: findDayMatches(normalized),
    shiftMatches: findShiftMatches(normalized),
    modifiers: findModifiers(normalized),
    specialTokens: findSpecial(normalized),
    notes: [],
    confidence: 0,
    needsLlm: false,
  };
  const { confidence, needsLlm } = scoreLine(line);
  line.confidence = confidence;
  line.needsLlm = needsLlm;
  return line;
}

// ─── Family → concrete shift type expansion ────────────────────────────────

export interface ExpansionContext {
  role: "kitchen" | "floor" | "both";
}

// Given a parsed line and the employee's role, produce the (day, shiftType)
// availability rows the line claims. Confidence flows from the line.
export function expandLineToRows(
  line: ParsedLine,
  ctx: ExpansionContext,
): { day: DayOfWeek; shiftType: ShiftType; available: boolean; confidence: number; note?: string }[] {
  const rows: ReturnType<typeof expandLineToRows> = [];

  // Determine which days the line refers to.
  const days = new Set<DayOfWeek>(line.dayMatches.map((d) => d.day));
  for (const sp of line.specialTokens) {
    if (sp.kind === "shishi_shabbat") days.add(5); // treat as Friday (Sat closed)
  }
  if (days.size === 0) return rows;

  // Compute concrete shift type families based on shift matches + modifiers + role.
  const fromTimeMod = line.modifiers.find((m) => m.kind === "fromTime");
  const fromTimeHour =
    typeof fromTimeMod?.value === "string"
      ? parseInt((fromTimeMod.value as string).split(":")[0] ?? "0", 10)
      : null;

  // If "from X:00" is present, it overrides/refines the shift family.
  function familiesFromShiftMatches(): ShiftFamily[] {
    if (line.shiftMatches.length === 0) return ["any"];
    return line.shiftMatches.map((s) => s.family);
  }

  // Family → list of candidate shift types (filtered by role + day allowed-ness later).
  function shiftTypesForFamily(family: ShiftFamily): ShiftType[] {
    switch (family) {
      case "morning":
      case "opening":
        return [SHIFT_TYPES.MORNING_KITCHEN, SHIFT_TYPES.MORNING_FLOOR];
      case "evening":
        return [
          SHIFT_TYPES.EVENING_KITCHEN,
          SHIFT_TYPES.EVENING_FLOOR_17,
          SHIFT_TYPES.CLOSING_A_19,
          SHIFT_TYPES.CLOSING_B_20,
        ];
      case "closing":
        return [SHIFT_TYPES.CLOSING_A_19, SHIFT_TYPES.CLOSING_B_20];
      case "morningOrEvening":
        return [
          SHIFT_TYPES.MORNING_KITCHEN,
          SHIFT_TYPES.MORNING_FLOOR,
          SHIFT_TYPES.EVENING_KITCHEN,
          SHIFT_TYPES.EVENING_FLOOR_17,
        ];
      case "any":
        return [
          SHIFT_TYPES.MORNING_KITCHEN,
          SHIFT_TYPES.MORNING_FLOOR,
          SHIFT_TYPES.EVENING_KITCHEN,
          SHIFT_TYPES.EVENING_FLOOR_17,
          SHIFT_TYPES.CLOSING_A_19,
          SHIFT_TYPES.CLOSING_B_20,
        ];
    }
  }

  let candidateShifts = new Set<ShiftType>();
  for (const fam of familiesFromShiftMatches()) {
    for (const st of shiftTypesForFamily(fam)) candidateShifts.add(st);
  }

  // Refine by from-time modifier: only keep shifts whose start hour is >= fromTime.
  if (fromTimeHour !== null) {
    const refined = new Set<ShiftType>();
    for (const st of candidateShifts) {
      const startHour = parseInt(SHIFT_DEFS[st].start.split(":")[0] ?? "0", 10);
      if (startHour >= fromTimeHour) refined.add(st);
    }
    if (refined.size > 0) candidateShifts = refined;
  }

  // Filter by employee role.
  const roleFilter = (st: ShiftType): boolean => {
    if (ctx.role === "both") return true;
    return SHIFT_DEFS[st].role === ctx.role;
  };
  const filtered = Array.from(candidateShifts).filter(roleFilter);

  // Emit rows.
  const note =
    line.notes.length > 0 ? line.notes.join(" · ") : undefined;
  for (const day of days) {
    for (const st of filtered) {
      // Skip days where the shift is not allowed (eg Friday non-closing).
      // The downstream consumer also filters but we keep noise out.
      rows.push({
        day,
        shiftType: st,
        available: true,
        confidence: line.confidence,
        note,
      });
    }
  }

  return rows;
}

// ─── Top-level: parse a whole message ──────────────────────────────────────

export function parseMessageWithRules(
  text: string,
  ctx: ExpansionContext,
): ParsedMessage {
  const lines = splitLines(text);
  const parsedLines: ParsedLine[] = lines.map((l) => parseLine(l.raw, l.normalized));
  const rows: ParsedMessage["rows"] = [];
  const warnings: string[] = [];

  for (const line of parsedLines) {
    const expanded = expandLineToRows(line, ctx);
    for (const row of expanded) {
      rows.push({
        ...row,
        source: "rule",
      });
    }
    if (line.dayMatches.length > 0 && line.shiftMatches.length === 0) {
      // implicit "all day"
    }
    if (line.confidence < 0.5) {
      warnings.push(`שורה לא ברורה: "${line.raw}"`);
    }
  }

  // Global modifiers: shift count requests, prefer evenings/mornings, no closings.
  let requestedShifts: number | undefined;
  for (const line of parsedLines) {
    for (const mod of line.modifiers) {
      if (mod.kind === "shiftCount" && typeof mod.value === "number") {
        requestedShifts = mod.value;
      }
    }
  }

  // Dedupe rows: same (day, shiftType) keeps max confidence.
  const dedup = new Map<string, ParsedMessage["rows"][number]>();
  for (const r of rows) {
    const key = `${r.day}:${r.shiftType}`;
    const existing = dedup.get(key);
    if (!existing || existing.confidence < r.confidence) dedup.set(key, r);
  }
  const finalRows = Array.from(dedup.values());

  const meanConfidence =
    parsedLines.length === 0
      ? 0
      : parsedLines.reduce((s, l) => s + l.confidence, 0) / parsedLines.length;

  const needsLlm = parsedLines.some((l) => l.needsLlm);

  // Surface emojis as a free-text note (informational only).
  const emojis = extractEmojis(text);
  if (emojis.length > 0 && requestedShifts === undefined) {
    // Some employees use 🙏 to mark requests; we don't act on it but the manager may.
  }

  return {
    rawText: text,
    lines: parsedLines,
    rows: finalRows,
    requestedShifts,
    warnings,
    meanConfidence,
    needsLlm,
  };
}
