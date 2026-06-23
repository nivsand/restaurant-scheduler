import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import authConfig from "@/auth.config";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      restaurantId: string;
      name: string;
    } & DefaultSession["user"];
  }
}

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function requireAuth() {
  const session = await auth();
  if (
    !session?.user?.id ||
    typeof session.user.restaurantId !== "string" ||
    !session.user.restaurantId
  ) {
    throw new Error("לא מחובר");
  }
  return {
    userId: session.user.id,
    restaurantId: session.user.restaurantId,
    session,
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (raw) => {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const email = parsed.data.email.trim().toLowerCase();
        const { password } = parsed.data;

        let manager;
        try {
          manager = await prisma.manager.findUnique({
            where: { email },
            select: {
              id: true,
              email: true,
              name: true,
              restaurantId: true,
              passwordHash: true,
              active: true,
            },
          });
        } catch {
          // Treat a transient DB error as a failed sign-in rather than crashing.
          return null;
        }

        if (!manager) return null;
        // Disabled managers cannot sign in.
        if (!manager.active) return null;
        if (!manager.passwordHash) return null;

        const ok = await bcrypt.compare(password, manager.passwordHash);
        if (!ok) return null;

        return {
          id: manager.id,
          email: manager.email,
          name: manager.name,
          restaurantId: manager.restaurantId,
        };
      },
    }),
  ],
});
