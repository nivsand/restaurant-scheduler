"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { sundayOf, nextSunday, prevSunday, formatWeekRange } from "@/lib/week";
import { Button } from "@/components/ui/button";

export function WeekPicker({
  weekStart,
  basePath,
}: {
  weekStart: Date;
  basePath: string;
}) {
  const router = useRouter();
  const params = useSearchParams();

  function goTo(d: Date) {
    const sp = new URLSearchParams(params.toString());
    sp.set("week", sundayOf(d).toISOString());
    router.push(`${basePath}?${sp.toString()}`);
  }

  return (
    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-3">
      <Button variant="ghost" size="sm" onClick={() => goTo(prevSunday(weekStart))}>
        ◀ שבוע קודם
      </Button>
      <div className="text-center">
        <div className="text-xs font-medium text-slate-500">שבוע</div>
        <div className="text-base font-semibold text-slate-900 num">
          {formatWeekRange(weekStart)}
        </div>
      </div>
      <Button variant="ghost" size="sm" onClick={() => goTo(nextSunday(weekStart))}>
        שבוע הבא ▶
      </Button>
    </div>
  );
}
