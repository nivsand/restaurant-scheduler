// Run with: npx tsx scripts/parser-smoke.ts
import { parseMessageWithRules } from "../lib/parser/rules";
import { DAY_NAMES_HE } from "../lib/days";
import { SHIFT_DEFS } from "../lib/shifts";

const CASES: Array<{ name: string; text: string; role: "floor" | "kitchen" | "both" }> = [
  {
    name: "Example 1 (HE evenings + מוצש + count)",
    role: "floor",
    text: `ראשון ערב
שני ערב
רביעי ערב
חמישי ערב
מוצש
2 משמרות 🙏🏻`,
  },
  {
    name: "Example 2 (HE mornings + opening)",
    role: "floor",
    text: `ראשון בוקר/ערב פתיחה
שני בוקר
שלישי בוקר
רביעי
חמישי
שישי`,
  },
  {
    name: "Example 3 (HE evenings + from-time)",
    role: "floor",
    text: `שני בוקר / מ 19:00
שלישי ערב
רביעי ערב
חמישי ערב
שישי שבת`,
  },
  {
    name: "Example 4 (English, arrive time)",
    role: "floor",
    text: `Sunday morning/evening
Monday morning
Tuesday evening (arrive 18)
Wednesday evening (arrive 16:15)
Thursday evening`,
  },
];

for (const c of CASES) {
  console.log("\n══════════════════════════════════════════════════════════════");
  console.log(c.name);
  console.log("──────────────────────────────────────────────────────────────");
  const result = parseMessageWithRules(c.text, { role: c.role });
  console.log(`Mean confidence: ${result.meanConfidence.toFixed(2)}`);
  console.log(`Needs LLM:       ${result.needsLlm}`);
  if (result.requestedShifts != null) {
    console.log(`Requested shifts: ${result.requestedShifts}`);
  }
  console.log(`Warnings:        ${result.warnings.length}`);
  for (const w of result.warnings) console.log(`  ! ${w}`);

  console.log("\nPer-line parse:");
  for (const line of result.lines) {
    const days = line.dayMatches.map((d) => DAY_NAMES_HE[d.day]).join(",") || "—";
    const shifts = line.shiftMatches.map((s) => s.family).join(",") || "—";
    const mods = line.modifiers.map((m) => `${m.kind}=${m.value ?? ""}`).join(",") || "—";
    console.log(
      `  [${(line.confidence * 100).toFixed(0).padStart(3)}%] "${line.raw}" → days:${days} shifts:${shifts} mods:${mods}${line.needsLlm ? " [LLM]" : ""}`,
    );
  }

  console.log(`\nExpanded rows (${result.rows.length}):`);
  // Group by day for readability
  const byDay = new Map<number, typeof result.rows>();
  for (const r of result.rows) {
    const arr = byDay.get(r.day) ?? [];
    arr.push(r);
    byDay.set(r.day, arr);
  }
  for (const [day, rs] of Array.from(byDay.entries()).sort((a, b) => a[0] - b[0])) {
    const list = rs
      .map((r) => `${SHIFT_DEFS[r.shiftType].labelHe}@${(r.confidence * 100).toFixed(0)}%`)
      .join(", ");
    console.log(`  ${DAY_NAMES_HE[day as keyof typeof DAY_NAMES_HE]}: ${list}`);
  }
}
