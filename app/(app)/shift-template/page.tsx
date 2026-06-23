import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  ALL_SHIFT_TYPES,
  SHIFT_DEFS,
  ShiftType,
} from "@/lib/shifts";
import { DAYS, DAY_NAMES_HE, DayOfWeek } from "@/lib/days";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  saveTemplateAction,
  saveRestaurantSettingsAction,
} from "./actions";
import { cn } from "@/lib/utils";

export default async function ShiftTemplatePage() {
  const session = await auth();
  if (!session?.user?.restaurantId) redirect("/login");
  const restaurantId = session.user.restaurantId;

  const [restaurant, templates] = await Promise.all([
    prisma.restaurant.findUnique({ where: { id: restaurantId } }),
    prisma.shiftTemplate.findMany({ where: { restaurantId } }),
  ]);
  if (!restaurant) notFound();

  const map = new Map<string, number>();
  for (const t of templates) map.set(`${t.day}:${t.shiftType}`, t.headcount);
  const get = (d: DayOfWeek, s: ShiftType) => map.get(`${d}:${s}`) ?? 0;

  // Build per-day totals
  const dayTotals: Record<DayOfWeek, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  for (const day of DAYS) {
    for (const st of ALL_SHIFT_TYPES) {
      dayTotals[day] += get(day, st);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">תבנית משמרות</h2>
        <p className="text-sm text-slate-500">
          הגדירו כמה עובדים נדרשים בכל משמרת. הזינו 0 כדי לסמן שהמשמרת סגורה ביום
          זה. ניתן לעקוף לשבוע ספציפי בעת יצירת סידור.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>מטריצה שבועית</CardTitle>
          <div className="text-xs text-slate-500">
            <LegendDot tone="kitchen" /> מטבח &nbsp;
            <LegendDot tone="floor" /> פלור &nbsp;
            <span className="text-slate-400">0 = סגור</span>
          </div>
        </CardHeader>
        <CardBody className="overflow-x-auto p-0">
          <form action={saveTemplateAction}>
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="p-3 text-start font-medium text-slate-600">
                    משמרת
                  </th>
                  {DAYS.map((d) => (
                    <th
                      key={d}
                      className="p-3 text-center font-medium text-slate-700"
                    >
                      {DAY_NAMES_HE[d]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ALL_SHIFT_TYPES.map((st) => {
                  const def = SHIFT_DEFS[st];
                  return (
                    <tr
                      key={st}
                      className="border-b border-slate-100 hover:bg-slate-50/40"
                    >
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "inline-block h-2.5 w-2.5 rounded-full",
                              def.role === "kitchen"
                                ? "bg-kitchen-500"
                                : "bg-floor-500",
                            )}
                          />
                          <div>
                            <div className="font-medium text-slate-900">
                              {def.labelHe}
                            </div>
                            <div className="text-xs text-slate-500 num">
                              {def.start}-{def.end}
                              {def.isClosing && " · סגירה"}
                            </div>
                          </div>
                        </div>
                      </td>
                      {DAYS.map((d) => {
                        const value = get(d, st);
                        return (
                          <td key={d} className="p-2 text-center">
                            <input
                              type="number"
                              min={0}
                              max={20}
                              name={`cell-${d}-${st}`}
                              defaultValue={value}
                              dir="ltr"
                              className={cn(
                                "h-10 w-14 rounded-lg border bg-white text-center text-sm font-medium focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200",
                                value === 0
                                  ? "border-slate-100 text-slate-300"
                                  : "border-slate-200 text-slate-900",
                              )}
                              title={value === 0 ? "0 = סגור ליום זה" : undefined}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                <tr className="border-t-2 border-slate-200 bg-slate-50">
                  <td className="p-3 font-medium text-slate-600">סה״כ ליום</td>
                  {DAYS.map((d) => (
                    <td
                      key={d}
                      className="p-3 text-center font-semibold text-slate-700 num"
                    >
                      {dayTotals[d]}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
            <div className="flex justify-end gap-2 border-t border-slate-100 p-4">
              <Button type="submit">שמור תבנית</Button>
            </div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>הגדרות מסעדה</CardTitle>
        </CardHeader>
        <CardBody>
          <form action={saveRestaurantSettingsAction} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="minRestHours">
                שעות מנוחה מינימליות בין משמרות
              </Label>
              <Input
                id="minRestHours"
                name="minRestHours"
                type="number"
                min={0}
                max={24}
                step={0.5}
                defaultValue={restaurant.minRestHours}
                dir="ltr"
                className="w-32 text-start"
              />
              <p className="text-xs text-slate-500">
                ברירת מחדל: 11 שעות (לפי תקנות העבודה). אפשר לעקוף ידנית בעת
                יצירת הסידור.
              </p>
            </div>
            <Button type="submit" variant="secondary">
              שמור הגדרות
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}

function LegendDot({ tone }: { tone: "kitchen" | "floor" }) {
  const cls = tone === "kitchen" ? "bg-kitchen-500" : "bg-floor-500";
  return <span className={cn("inline-block h-2 w-2 rounded-full align-middle", cls)} />;
}
