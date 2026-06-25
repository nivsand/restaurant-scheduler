"use client";

import { useRouter } from "next/navigation";
import {
  defaultActiveWeekStart,
  nextSunday,
  prevSunday,
  formatWeekParam,
  formatWeekRange,
} from "@/lib/week";
import { Button } from "@/components/ui/button";

export function WeekPicker({
  weekStart,
  basePath,
}: {
  weekStart: Date;
  basePath: string;
}) {
  const router = useRouter();

  function goTo(d: Date) {
    router.push(`${basePath}?week=${formatWeekParam(d)}`);
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-cream-200 bg-white p-3 shadow-sm">
      <Button variant="ghost" size="sm" onClick={() => goTo(prevSunday(weekStart))}>
        ◀ שבוע קודם
      </Button>
      <div className="text-center">
        <div className="text-xs font-medium text-brown-500">שבוע</div>
        <div className="text-base font-bold text-brown-900 num">
          {formatWeekRange(weekStart)}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={() => goTo(defaultActiveWeekStart())}>
          השבוע
        </Button>
        <Button variant="ghost" size="sm" onClick={() => goTo(nextSunday(weekStart))}>
          שבוע הבא ▶
        </Button>
      </div>
    </div>
  );
}
