import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  getOrCreateWeek,
  parseWeekStartParam,
} from "@/lib/week";

export default async function ScheduleIndex({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.restaurantId) redirect("/login");
  const restaurantId = session.user.restaurantId;
  const sp = await searchParams;
  const weekStart = parseWeekStartParam(sp.week);
  const week = await getOrCreateWeek(restaurantId, weekStart);
  redirect(`/schedule/${week.id}`);
}
