// Text-normalization helpers used before rule matching.
// Goal: maximize match rates without losing semantic signal.

// Common emoji ranges. We strip these from the text before matching but
// surface their presence as a soft signal (gratitude emojis often accompany
// shift-count requests).
const EMOJI_RE =
  /[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|‍|️/gu;

// Normalize Hebrew "geresh" (׳) and "gershayim" (״) to ASCII equivalents and
// strip RTL/LTR/zero-width marks.
const PUNCT_NORMALIZE_MAP: Array<[RegExp, string]> = [
  [/[׳]/g, "'"],         // HEBREW PUNCTUATION GERESH ׳ → '
  [/[״]/g, '"'],         // HEBREW PUNCTUATION GERSHAYIM ״ → "
  [/[​-‏‪-‮⁦-⁩﻿]/g, ""], // bidi marks
];

export function extractEmojis(text: string): string[] {
  const found = text.match(EMOJI_RE);
  return found ? Array.from(new Set(found)) : [];
}

// Normalize a single line of text:
// - Trim, collapse internal whitespace
// - Strip emojis (still useful: caller passes raw text in too)
// - Normalize Hebrew geresh / gershayim
// - Strip bidi marks
// - Drop trailing punctuation that signals nothing (e.g. ".", "!" alone)
export function normalizeLine(line: string): string {
  let s = line;
  for (const [re, rep] of PUNCT_NORMALIZE_MAP) s = s.replace(re, rep);
  s = s.replace(EMOJI_RE, " ");
  s = s.replace(/[ \s\t]+/g, " ");
  s = s.trim();
  // Remove leading bullet chars
  s = s.replace(/^[-•*–—]\s*/, "");
  return s;
}

// Split a multi-line message into non-empty normalized lines, preserving raw.
export function splitLines(text: string): Array<{ raw: string; normalized: string }> {
  const lines = text.split(/\r?\n/);
  const out: Array<{ raw: string; normalized: string }> = [];
  for (const raw of lines) {
    const normalized = normalizeLine(raw);
    if (normalized.length === 0) continue;
    out.push({ raw, normalized });
  }
  return out;
}

// Split a bulk paste into per-employee blocks by blank-line separators.
export function splitBlocks(text: string): string[] {
  // Two or more newlines separate blocks. Trim each block.
  return text
    .split(/\r?\n\s*\r?\n+/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);
}
