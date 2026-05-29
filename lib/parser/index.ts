// Top-level parser orchestrator. Try rules first; for low-confidence results
// (and only when an API key is configured), supplement with Claude Haiku.

import { ShiftType } from "@/lib/shifts";
import { DayOfWeek } from "@/lib/days";
import { ParsedMessage, ParsedAvailabilityRow } from "./types";
import {
  parseMessageWithRules,
  ExpansionContext,
} from "./rules";
import { llmParseFallback, shouldUseLlmFallback } from "./llm";

export interface ParseResult {
  rows: ParsedAvailabilityRow[];
  requestedShifts?: number;
  warnings: string[];
  meanConfidence: number;
  usedLlm: boolean;
  rules: ParsedMessage;
}

export async function parseAvailability(
  message: string,
  ctx: ExpansionContext & { employeeName: string },
): Promise<ParseResult> {
  const rules = parseMessageWithRules(message, ctx);

  const ruleRows: ParsedAvailabilityRow[] = rules.rows.map((r) => ({
    day: r.day,
    shiftType: r.shiftType,
    available: r.available,
    confidence: r.confidence,
    note: r.note,
    source: "rule" as const,
  }));

  const wantsLlm = shouldUseLlmFallback(rules.meanConfidence, rules.needsLlm);
  let usedLlm = false;
  let llmRows: ParsedAvailabilityRow[] = [];
  let requestedShifts = rules.requestedShifts;

  if (wantsLlm) {
    const llm = await llmParseFallback(message, {
      employeeName: ctx.employeeName,
      role: ctx.role,
    });
    if (llm) {
      usedLlm = true;
      llmRows = llm.rows.map((r) => ({
        day: r.day as DayOfWeek,
        shiftType: r.shiftType as ShiftType,
        available: r.available,
        confidence: r.confidence,
        note: r.note ?? undefined,
        source: "llm" as const,
      }));
      if (llm.requestedShifts != null) requestedShifts = llm.requestedShifts;
    }
  }

  // Merge rule rows + LLM rows. For the same (day, shiftType):
  //  - prefer LLM when LLM has higher confidence
  //  - prefer rule when rule has higher confidence
  const merged = new Map<string, ParsedAvailabilityRow>();
  for (const r of ruleRows) merged.set(`${r.day}:${r.shiftType}`, r);
  for (const r of llmRows) {
    const key = `${r.day}:${r.shiftType}`;
    const existing = merged.get(key);
    if (!existing || existing.confidence < r.confidence) merged.set(key, r);
  }

  const finalRows = Array.from(merged.values());
  const meanConfidence =
    finalRows.length === 0
      ? 0
      : finalRows.reduce((s, r) => s + r.confidence, 0) / finalRows.length;

  return {
    rows: finalRows,
    requestedShifts,
    warnings: rules.warnings,
    meanConfidence,
    usedLlm,
    rules,
  };
}

export type { ParsedAvailabilityRow };
