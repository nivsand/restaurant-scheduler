import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Day-of-week: 0..6 (Sunday=0)
// Shift type strings must match lib/shifts.ts SHIFT_TYPES keys.
const SHIFT = {
  MORNING_KITCHEN: "MORNING_KITCHEN",
  MORNING_FLOOR: "MORNING_FLOOR",
  EVENING_KITCHEN: "EVENING_KITCHEN",
  EVENING_FLOOR_17: "EVENING_FLOOR_17",
  CLOSING_A_19: "CLOSING_A_19",
  CLOSING_B_20: "CLOSING_B_20",
} as const;

function randomToken(length = 24): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < length; i++)
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

async function main() {
  const email = (process.env.DEFAULT_MANAGER_EMAIL ?? "manager@bar.local").toLowerCase();
  const password = process.env.DEFAULT_MANAGER_PASSWORD ?? "changeme";

  const restaurant = await prisma.restaurant.upsert({
    where: { id: "default-restaurant" },
    create: {
      id: "default-restaurant",
      name: "בר גלים",
      minRestHours: 11,
    },
    update: {},
  });

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.manager.upsert({
    where: { email },
    create: {
      restaurantId: restaurant.id,
      email,
      name: "מנהל",
      passwordHash,
      isAdmin: true,
      active: true,
    },
    update: { passwordHash, restaurantId: restaurant.id, isAdmin: true, active: true },
  });

  // Sample employees mirroring the בר גלים sheet
  const employees: {
    name: string;
    role: "kitchen" | "floor" | "both";
    maxShifts?: number;
    onlyMornings?: boolean;
    onlyEvenings?: boolean;
    noClosings?: boolean;
  }[] = [
    { name: "רוני", role: "floor" },
    { name: "אנה", role: "floor" },
    { name: "גאיה", role: "floor" },
    { name: "רון", role: "floor" },
    { name: "דקל", role: "floor", maxShifts: 5 },
    { name: "מאי", role: "floor", onlyMornings: true },
    { name: "עמית הבן", role: "floor" },
    { name: "עמית הבת", role: "floor" },
    { name: "שי-לי", role: "floor" },
    { name: "נטע", role: "kitchen" },
    { name: "רוס", role: "kitchen" },
    { name: "טאיו", role: "kitchen" },
    { name: "קרו", role: "kitchen" },
    { name: "מאיה", role: "kitchen", noClosings: true },
  ];

  for (const emp of employees) {
    const existing = await prisma.employee.findFirst({
      where: { restaurantId: restaurant.id, name: emp.name },
    });
    if (existing) continue;
    await prisma.employee.create({
      data: {
        restaurantId: restaurant.id,
        name: emp.name,
        role: emp.role,
        maxShifts: emp.maxShifts ?? null,
        onlyMornings: emp.onlyMornings ?? false,
        onlyEvenings: emp.onlyEvenings ?? false,
        noClosings: emp.noClosings ?? false,
        weekendOk: true,
        submissionToken: randomToken(),
      },
    });
  }

  // Default shift template.
  // Sun-Thu (0-4): full operation.
  // Fri (5): morning open, evening closed.
  // Sat (6): morning closed, evening open.
  // Manager can edit any cell via /shift-template — 0 means "closed for that combo."
  const defaults: Array<{ day: number; shift: string; n: number }> = [];
  for (const day of [0, 1, 2, 3, 4]) {
    defaults.push({ day, shift: SHIFT.MORNING_FLOOR, n: 2 });
    defaults.push({ day, shift: SHIFT.MORNING_KITCHEN, n: 1 });
    defaults.push({ day, shift: SHIFT.EVENING_KITCHEN, n: 1 });
    defaults.push({ day, shift: SHIFT.EVENING_FLOOR_17, n: 3 });
    defaults.push({ day, shift: SHIFT.CLOSING_A_19, n: 1 });
    defaults.push({ day, shift: SHIFT.CLOSING_B_20, n: 1 });
  }
  // Friday: morning open, evening closed
  defaults.push({ day: 5, shift: SHIFT.MORNING_FLOOR, n: 2 });
  defaults.push({ day: 5, shift: SHIFT.MORNING_KITCHEN, n: 1 });
  defaults.push({ day: 5, shift: SHIFT.EVENING_KITCHEN, n: 0 });
  defaults.push({ day: 5, shift: SHIFT.EVENING_FLOOR_17, n: 0 });
  defaults.push({ day: 5, shift: SHIFT.CLOSING_A_19, n: 0 });
  defaults.push({ day: 5, shift: SHIFT.CLOSING_B_20, n: 0 });
  // Saturday: morning closed, evening open
  defaults.push({ day: 6, shift: SHIFT.MORNING_FLOOR, n: 0 });
  defaults.push({ day: 6, shift: SHIFT.MORNING_KITCHEN, n: 0 });
  defaults.push({ day: 6, shift: SHIFT.EVENING_KITCHEN, n: 1 });
  defaults.push({ day: 6, shift: SHIFT.EVENING_FLOOR_17, n: 3 });
  defaults.push({ day: 6, shift: SHIFT.CLOSING_A_19, n: 1 });
  defaults.push({ day: 6, shift: SHIFT.CLOSING_B_20, n: 1 });

  for (const d of defaults) {
    await prisma.shiftTemplate.upsert({
      where: {
        restaurantId_day_shiftType: {
          restaurantId: restaurant.id,
          day: d.day,
          shiftType: d.shift,
        },
      },
      create: {
        restaurantId: restaurant.id,
        day: d.day,
        shiftType: d.shift,
        headcount: d.n,
      },
      update: { headcount: d.n },
    });
  }

  console.log("");
  console.log("┌─────────────────────────────────────────────");
  console.log("│ Seed complete.");
  console.log("│ Manager login:");
  console.log(`│   email:    ${email}`);
  console.log(`│   password: ${password}`);
  console.log("│ Restaurant:", restaurant.name);
  console.log("│ Employees seeded:", employees.length);
  console.log("└─────────────────────────────────────────────");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
