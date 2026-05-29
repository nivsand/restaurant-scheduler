import type { Session } from "next-auth";
import { prisma } from "@/lib/db";

export type ValidSession = Session & {
  user: Session["user"] & {
    id: string;
    restaurantId: string;
    name: string;
  };
};

export function hasValidSessionUser(
  session: Session | null,
): session is ValidSession {
  return (
    typeof session?.user?.id === "string" &&
    session.user.id.length > 0 &&
    typeof session.user.restaurantId === "string" &&
    session.user.restaurantId.length > 0
  );
}

export async function getActiveManagerForSession(session: ValidSession) {
  const manager = await prisma.manager.findUnique({
    where: { id: session.user.id },
    include: { restaurant: { select: { name: true } } },
  });

  if (!manager?.active) return null;
  if (manager.restaurantId !== session.user.restaurantId) return null;
  return manager;
}
