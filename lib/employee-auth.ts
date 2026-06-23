import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

const COOKIE_NAME = "employee-session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function getSecret() {
  const raw = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "";
  return new TextEncoder().encode(raw);
}

export async function signEmployeeToken(
  employeeId: string,
  restaurantId: string,
): Promise<string> {
  return new SignJWT({ employeeId, restaurantId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(getSecret());
}

export async function verifyEmployeeToken(
  token: string,
): Promise<{ employeeId: string; restaurantId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (
      typeof payload.employeeId === "string" &&
      typeof payload.restaurantId === "string"
    ) {
      return {
        employeeId: payload.employeeId,
        restaurantId: payload.restaurantId,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function getEmployeeSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const payload = await verifyEmployeeToken(token);
  if (!payload) return null;

  const employee = await prisma.employee.findFirst({
    where: {
      id: payload.employeeId,
      restaurantId: payload.restaurantId,
      archived: false,
    },
    include: { restaurant: true },
  });
  if (!employee) return null;

  return employee;
}

export function employeeCookieOptions() {
  return {
    name: COOKIE_NAME,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: MAX_AGE,
  };
}

export { COOKIE_NAME };
