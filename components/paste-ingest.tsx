"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { splitBlocks } from "@/lib/parser/normalize";
import { ingestPasteAction } from "@/app/(app)/availability/actions";

interface EmployeeOption {
  id: string;
  name: string;
  role: string;
}

export function PasteIngest({
  weekStart,
  weekId,
  employees,
}: {
  weekStart: string; // ISO
  weekId: string;
  employees: EmployeeOption[];
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [blocks, setBlocks] = useState<
    { content: string; employeeId: string }[]
  >([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();

  function detectBlocks() {
    const parts = splitBlocks(text);
    setBlocks(parts.map((p) => ({ content: p, employeeId: "" })));
    setWarnings([]);
  }

  function updateBlock(i: number, patch: Partial<(typeof blocks)[number]>) {
    setBlocks((bs) => bs.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  }

  function removeBlock(i: number) {
    setBlocks((bs) => bs.filter((_, idx) => idx !== i));
  }

  function submit() {
    const tagged = blocks.filter((b) => b.employeeId && b.content.trim());
    if (tagged.length === 0) {
      setWarnings(["בחר עובד לפחות לבלוק אחד"]);
      return;
    }
    startTransition(async () => {
      try {
        const result = await ingestPasteAction(
          JSON.stringify({
            weekStart,
            blocks: tagged,
          }),
        );
        setWarnings(result.warnings ?? []);
        setText("");
        setBlocks([]);
        router.push(`/availability/review/${result.weekId}`);
      } catch (err) {
        setWarnings([(err as Error).message]);
      }
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>הדבקת הודעות מ-WhatsApp</CardTitle>
        <span className="text-xs text-brown-500">
          ערבל הודעות מרובות, בלוק לכל עובד, שורה ריקה בין בלוקים
        </span>
      </CardHeader>
      <CardBody className="space-y-4">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          dir="auto"
          placeholder={
            "ראשון ערב\nשני ערב\nחמישי ערב\n2 משמרות 🙏\n\nשני בוקר\nשלישי בוקר\nרביעי\nחמישי\nשישי"
          }
          className="font-mono text-sm"
        />

        <div className="flex items-center gap-2">
          <Button onClick={detectBlocks} variant="secondary" disabled={!text.trim()}>
            זיהוי בלוקים
          </Button>
          {blocks.length > 0 && (
            <span className="text-sm text-brown-500">
              {blocks.length} בלוקים זוהו
            </span>
          )}
        </div>

        {blocks.length > 0 && (
          <div className="space-y-3">
            {blocks.map((b, i) => (
              <div
                key={i}
                className="rounded-xl border border-cream-200 bg-cream-50/50 p-3"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <select
                    value={b.employeeId}
                    onChange={(e) =>
                      updateBlock(i, { employeeId: e.target.value })
                    }
                    className="h-9 rounded-lg border border-cream-200 bg-white px-2 text-sm focus:border-brand-500 focus:outline-none"
                  >
                    <option value="">בחר עובד...</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name} ({roleLabel(emp.role)})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => removeBlock(i)}
                    className="text-xs text-brown-500 hover:text-rose-600"
                  >
                    הסר
                  </button>
                </div>
                <pre className="overflow-x-auto whitespace-pre-wrap text-sm text-brown-700">
                  {b.content}
                </pre>
              </div>
            ))}

            <div className="flex justify-end gap-2 border-t border-cream-200 pt-3">
              <Button
                onClick={submit}
                disabled={
                  isPending || blocks.every((b) => !b.employeeId)
                }
              >
                {isPending ? "מעבד..." : "פענוח ושמירה"}
              </Button>
            </div>
          </div>
        )}

        {warnings.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
            <div className="mb-1 font-medium text-amber-900">הערות</div>
            <ul className="list-disc space-y-1 ps-5 text-amber-800">
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        {/* weekId is plumbed in for future use (eg link to review page directly) */}
        <input type="hidden" value={weekId} readOnly hidden />
      </CardBody>
    </Card>
  );
}

function roleLabel(role: string): string {
  if (role === "kitchen") return "מטבח";
  if (role === "floor") return "פלור";
  return "שניהם";
}
