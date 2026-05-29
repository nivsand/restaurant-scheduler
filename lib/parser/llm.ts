// Claude Haiku fallback. Invoked only for lines that the rule-based parser
// could not handle (confidence < threshold). If no API key is configured,
// silently returns nothing — the rule output stands as-is.

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { DayOfWeek, DAY_NAMES_HE } from "@/lib/days";
import {
  ALL_SHIFT_TYPES,
  SHIFT_DEFS,
  SHIFT_TYPES,
  ShiftType,
} from "@/lib/shifts";

const LlmRowSchema = z.object({
  day: z.number().int().min(0).max(6),
  shiftType: z.enum([
    SHIFT_TYPES.MORNING_KITCHEN,
    SHIFT_TYPES.MORNING_FLOOR,
    SHIFT_TYPES.EVENING_KITCHEN,
    SHIFT_TYPES.EVENING_FLOOR_17,
    SHIFT_TYPES.CLOSING_A_19,
    SHIFT_TYPES.CLOSING_B_20,
  ]),
  available: z.boolean(),
  confidence: z.number().min(0).max(1),
  note: z.string().optional().nullable(),
});

const LlmResponseSchema = z.object({
  rows: z.array(LlmRowSchema),
  requestedShifts: z.number().int().min(0).max(14).optional().nullable(),
  notes: z.string().optional().nullable(),
});

export type LlmParseResult = z.infer<typeof LlmResponseSchema>;

export async function llmParseFallback(
  message: string,
  context: { employeeName: string; role: "kitchen" | "floor" | "both" },
): Promise<LlmParseResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const client = new Anthropic({ apiKey });

  const shiftCatalog = ALL_SHIFT_TYPES.map((s) => {
    const d = SHIFT_DEFS[s];
    return `- ${s}: ${d.labelHe} (${d.start}-${d.end}${d.endsNextDay ? " next day" : ""}, ${d.role}${d.isClosing ? ", closing" : ""})`;
  }).join("\n");

  const dayCatalog = (Object.keys(DAY_NAMES_HE) as unknown as DayOfWeek[])
    .map((d) => `${d}=${DAY_NAMES_HE[d]}`)
    .join(", ");

  const systemPrompt = `You translate a single employee's free-text availability message into structured shift availability.
The restaurant runs Sunday→Friday. Saturday is fully closed. Friday only has closing shifts (19:00 and 20:00).

Days are numbered ${dayCatalog}.

Allowed shift types:
${shiftCatalog}

Employee: ${context.employeeName} (role: ${context.role}).
Only emit rows for shift types whose role matches the employee, except role="both" who may do any.

Rules:
- "ראשון בוקר" → day 0, all morning shifts the employee can do.
- "ראשון ערב" → day 0, all evening shifts the employee can do (including closings).
- "ראשון" (day only) → all shifts that day.
- "מ 19:00" / "from 19" → restrict that line to shifts starting at 19:00 or later.
- "סגירה"/"closing" → only the two closing shifts.
- "פתיחה"/"opening" → morning shifts.
- "מוצש" is ambiguous when Saturday is closed — emit nothing for it, but include a note explaining.
- "שישי שבת" → treat as Friday closings only (Saturday is closed); note ambiguity.
- "X משמרות" → set requestedShifts to X (do NOT create rows from this).
- If a line is unintelligible, omit it and add a note.
- Confidence: 1.0 = clear, 0.7 = mild ambiguity (extra modifier), 0.5 = significant ambiguity, <0.5 = guess.

Return ONLY a JSON object with this shape, no prose:
{
  "rows": [{ "day": 0..6, "shiftType": "...", "available": true, "confidence": 0..1, "note": "..." }],
  "requestedShifts": number | null,
  "notes": "any global notes" | null
}`;

  const userPrompt = `Message:\n${message}`;

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    // Concatenate text blocks
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    // Strip code fences if present
    const cleaned = text.replace(/^```(?:json)?\s*|\s*```$/g, "");
    const parsed = JSON.parse(cleaned);
    const validated = LlmResponseSchema.safeParse(parsed);
    if (!validated.success) {
      console.warn("[parser/llm] schema validation failed:", validated.error.message);
      return null;
    }
    return validated.data;
  } catch (err) {
    console.warn("[parser/llm] error:", (err as Error).message);
    return null;
  }
}

// Cheap heuristic: only call LLM if rules produced low-confidence output.
export function shouldUseLlmFallback(meanConfidence: number, anyLineNeedsLlm: boolean): boolean {
  return anyLineNeedsLlm || meanConfidence < 0.6;
}

export type LlmRow = z.infer<typeof LlmRowSchema>;
