// Create-or-reset a single manager login, then SELF-VERIFY the bcrypt hash so
// you know the credentials will work before you try the UI.
//
// All values are supplied via environment variables — nothing is hardcoded.
// Run against a specific database by exporting DATABASE_URL (and DIRECT_URL)
// first. Example:
//
//   LOGIN_EMAIL=admin@example.com \
//   LOGIN_PASSWORD='choose-a-strong-password' \
//   LOGIN_NAME='Admin' \
//   RESTAURANT_NAME='My Restaurant' \
//   DATABASE_URL='postgresql://...' \
//   npx tsx scripts/reset-login.ts
//
// Never logs the plaintext password.

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.LOGIN_EMAIL ?? "").trim().toLowerCase();
  const password = process.env.LOGIN_PASSWORD ?? "";
  const name = (process.env.LOGIN_NAME ?? "Admin").trim();
  const restaurantId = (process.env.RESTAURANT_ID ?? "default-restaurant").trim();
  const restaurantName = (process.env.RESTAURANT_NAME ?? "Restaurant").trim();

  if (!email || !password) {
    console.error(
      "[reset-login] LOGIN_EMAIL and LOGIN_PASSWORD env vars are required.",
    );
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("[reset-login] LOGIN_PASSWORD must be at least 8 characters.");
    process.exit(1);
  }

  // 1. Ensure the restaurant exists (the manager FK requires it).
  const restaurant = await prisma.restaurant.upsert({
    where: { id: restaurantId },
    create: { id: restaurantId, name: restaurantName, minRestHours: 11 },
    update: {},
  });

  // 2. Upsert the manager with a freshly computed bcrypt hash.
  const passwordHash = await bcrypt.hash(password, 10);
  const manager = await prisma.manager.upsert({
    where: { email },
    create: {
      email,
      name,
      passwordHash,
      isAdmin: true,
      active: true,
      restaurantId: restaurant.id,
    },
    update: {
      // Reset everything that could be blocking login.
      passwordHash,
      name,
      isAdmin: true,
      active: true,
      restaurantId: restaurant.id,
    },
  });

  // 3. Self-verify: read the row back and run the exact check authorize() runs.
  const check = await prisma.manager.findUnique({
    where: { email },
    select: { id: true, passwordHash: true, active: true, isAdmin: true, restaurantId: true },
  });
  const verifies =
    !!check && check.active && (await bcrypt.compare(password, check.passwordHash));

  console.log("┌──────────────────────────────────────────────");
  console.log("│ reset-login complete");
  console.log(`│ manager id:    ${manager.id}`);
  console.log(`│ email:         ${email}`);
  console.log(`│ name:          ${name}`);
  console.log(`│ restaurantId:  ${check?.restaurantId}`);
  console.log(`│ isAdmin:       ${check?.isAdmin}`);
  console.log(`│ active:        ${check?.active}`);
  console.log(`│ bcrypt verify: ${verifies ? "PASS ✓ (login will work)" : "FAIL ✗"}`);
  console.log("└──────────────────────────────────────────────");

  if (!verifies) process.exit(1);
}

main()
  .catch((e) => {
    console.error("[reset-login] error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
