// One-time migration: add email + passwordHash columns to Employee table.
// Run with: npx tsx scripts/add-employee-credentials.ts

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Add columns (IF NOT EXISTS prevents errors on re-run)
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "email" TEXT`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "passwordHash" TEXT`,
  );

  // Add unique index (restaurantId, email) — allows multiple NULLs in Postgres
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "Employee_restaurantId_email_key"
    ON "Employee" ("restaurantId", "email")
  `);

  console.log("Done: email + passwordHash columns added to Employee table");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
