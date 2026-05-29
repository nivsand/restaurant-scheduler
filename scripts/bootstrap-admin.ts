// Idempotent first-manager bootstrap for production.
// Reads ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME, RESTAURANT_NAME from env.
// Creates the restaurant + manager if they don't exist; updates the manager's
// password if it changed. Safe to run on every deploy.
//
// Run with: npx tsx scripts/bootstrap-admin.ts

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "";
  const name = (process.env.ADMIN_NAME ?? "מנהל").trim();
  const restaurantName = (process.env.RESTAURANT_NAME ?? "המסעדה").trim();

  if (!email || !password) {
    console.error(
      "Missing required env: ADMIN_EMAIL and ADMIN_PASSWORD must be set.",
    );
    process.exit(1);
  }

  if (password.length < 8) {
    console.error("ADMIN_PASSWORD must be at least 8 characters.");
    process.exit(1);
  }

  // Restaurant: one row, deterministic ID so we don't accidentally make duplicates.
  const RESTAURANT_ID = "default-restaurant";
  const restaurant = await prisma.restaurant.upsert({
    where: { id: RESTAURANT_ID },
    create: {
      id: RESTAURANT_ID,
      name: restaurantName,
      minRestHours: 11,
    },
    update: { name: restaurantName },
  });

  const passwordHash = await bcrypt.hash(password, 10);
  const manager = await prisma.manager.upsert({
    where: { email },
    create: {
      restaurantId: restaurant.id,
      email,
      name,
      passwordHash,
      isAdmin: true,
      active: true,
    },
    update: {
      passwordHash,
      name,
      restaurantId: restaurant.id,
      // The bootstrap manager must always remain an active admin so the
      // account can never lock itself out of User Management.
      isAdmin: true,
      active: true,
    },
  });

  console.log("┌──────────────────────────────────────────────");
  console.log("│ Admin bootstrap complete.");
  console.log(`│ Restaurant: ${restaurant.name}  (id=${restaurant.id})`);
  console.log(`│ Manager:    ${manager.name}  <${manager.email}>`);
  console.log("│ Password was set from ADMIN_PASSWORD env.");
  console.log("└──────────────────────────────────────────────");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
