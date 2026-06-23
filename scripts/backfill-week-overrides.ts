// One-time backfill: snapshot current ShiftTemplate headcounts into WeekOverride
// for every existing week that doesn't already have overrides. This prevents
// future template changes from retroactively altering historical schedules.
//
// Run with: npx tsx scripts/backfill-week-overrides.ts

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const restaurants = await prisma.restaurant.findMany({ select: { id: true } });

  for (const restaurant of restaurants) {
    const templates = await prisma.shiftTemplate.findMany({
      where: { restaurantId: restaurant.id },
    });
    if (templates.length === 0) {
      console.log(`Restaurant ${restaurant.id}: no templates, skipping`);
      continue;
    }

    const weeks = await prisma.week.findMany({
      where: { restaurantId: restaurant.id },
      include: { overrides: { select: { id: true }, take: 1 } },
    });

    let backfilled = 0;
    for (const week of weeks) {
      if (week.overrides.length > 0) continue;
      await prisma.weekOverride.createMany({
        data: templates.map((t) => ({
          weekId: week.id,
          day: t.day,
          shiftType: t.shiftType,
          headcount: t.headcount,
        })),
        skipDuplicates: true,
      });
      backfilled++;
    }

    console.log(
      `Restaurant ${restaurant.id}: ${backfilled}/${weeks.length} weeks backfilled`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
