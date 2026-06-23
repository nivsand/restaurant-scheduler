"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { signEmployeeToken, employeeCookieOptions } from "@/lib/employee-auth";

export async function employeeLoginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    redirect("/employee/login?error=1");
  }

  // Single-tenant: find the one restaurant
  const restaurant = await prisma.restaurant.findFirst();
  if (!restaurant) {
    redirect("/employee/login?error=1");
  }

  const employee = await prisma.employee.findFirst({
    where: {
      restaurantId: restaurant.id,
      email,
      archived: false,
    },
  });

  if (!employee?.passwordHash) {
    redirect("/employee/login?error=1");
  }

  const valid = await bcrypt.compare(password, employee.passwordHash);
  if (!valid) {
    redirect("/employee/login?error=1");
  }

  const token = await signEmployeeToken(employee.id, employee.restaurantId);
  const cookieStore = await cookies();
  const opts = employeeCookieOptions();
  cookieStore.set(opts.name, token, opts);

  redirect("/employee");
}
