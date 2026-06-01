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

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (raw) => {
        // All log lines are prefixed [auth] and NEVER include the plaintext
        // password. They surface in Vercel → Project → Logs (Functions).
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) {
          console.warn("[auth] login rejected: malformed credentials payload");
          return null;
        }
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
              isAdmin: true,
            },
          });
        } catch (err) {
          // A DB/connection/schema error here also presents to the user as
          // CredentialsSignin — log it so it isn't mistaken for "wrong password".
          console.error(`[auth] login error: DB query failed email=${email}`, err);
          return null;
        }

        if (!manager) {
          console.warn(`[auth] login failed: manager not found email=${email}`);
          return null;
        }
        if (!manager.active) {
          console.warn(
            `[auth] login failed: manager inactive id=${manager.id} email=${email}`,
          );
          return null;
        }
        if (!manager.passwordHash) {
          console.warn(
            `[auth] login failed: missing passwordHash id=${manager.id} email=${email}`,
          );
          return null;
        }

        const ok = await bcrypt.compare(password, manager.passwordHash);
        if (!ok) {
          console.warn(
            `[auth] login failed: password mismatch id=${manager.id} email=${email}`,
          );
          return null;
        }

        console.info(
          `[auth] login success id=${manager.id} email=${email} isAdmin=${manager.isAdmin}`,
        );
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
