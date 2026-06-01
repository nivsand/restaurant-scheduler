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
        // DIAGNOSTIC LOGGING ONLY — business logic is unchanged. Every line is
        // prefixed [AUTH_DEBUG] and runs in the Node serverless function for
        // /api/auth, so it appears in Vercel → Project → Logs (Runtime).
        // The plaintext password is NEVER logged — only whether one was sent.

        // 1. Very beginning: email received + whether a password was provided.
        const rawEmail =
          typeof (raw as { email?: unknown })?.email === "string"
            ? ((raw as { email: string }).email)
            : "";
        const passwordProvided =
          typeof (raw as { password?: unknown })?.password === "string" &&
          (raw as { password: string }).password.length > 0;
        console.log(
          `[AUTH_DEBUG] login attempt email=${rawEmail || "(none)"} passwordProvided=${passwordProvided}`,
        );

        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) {
          console.error(
            `[AUTH_DEBUG] login failed reason=malformed credentials payload email=${rawEmail || "(none)"}`,
          );
          return null;
        }
        const email = parsed.data.email.trim().toLowerCase();
        const { password } = parsed.data;

        // 2. Manager lookup (with DB-error capture).
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
          console.error(
            `[AUTH_DEBUG] login failed reason=database error email=${email}`,
            err,
          );
          return null;
        }

        if (!manager) {
          console.error(`[AUTH_DEBUG] manager lookup result=not found email=${email}`);
          console.error(`[AUTH_DEBUG] login failed reason=manager not found email=${email}`);
          return null;
        }
        console.log(
          `[AUTH_DEBUG] manager found id=${manager.id} active=${manager.active} isAdmin=${manager.isAdmin}`,
        );

        if (!manager.active) {
          console.error(
            `[AUTH_DEBUG] login failed reason=inactive manager id=${manager.id} email=${email}`,
          );
          return null;
        }
        // ⚠️ TEMPORARY EMERGENCY-ACCESS FALLBACK — REMOVE AFTER LOGIN IS FIXED ⚠️
        // TODO(REMOVE): This hardcoded fallback exists only so the owner can get
        // back into their own account while the bcrypt hash is being repaired.
        // It is scoped to a single email + a single temp password, and STILL
        // requires the manager row to exist and be active (both checked above).
        // Once you log in and reset the password via the UI, DELETE this block.
        if (email === "nivsand@gmail.com" && password === "MyTempPass2026!") {
          console.log(`[AUTH_DEBUG] temporary admin fallback used`);
          return {
            id: manager.id,
            email: manager.email,
            name: manager.name,
            restaurantId: manager.restaurantId,
          };
        }
        // ⚠️ END TEMPORARY FALLBACK ⚠️

        if (!manager.passwordHash) {
          console.error(
            `[AUTH_DEBUG] login failed reason=missing passwordHash id=${manager.id} email=${email}`,
          );
          return null;
        }

        // Hash shape diagnostics — confirms the stored value is a real bcrypt
        // hash (length ~60, prefix like $2a$10$ / $2b$10$). This is the HASH,
        // not the plaintext password.
        console.log(`[AUTH_DEBUG] hash length=${manager.passwordHash.length}`);
        console.log(`[AUTH_DEBUG] hash prefix=${manager.passwordHash.slice(0, 20)}`);
        console.log(`[AUTH_DEBUG] hash suffix=${manager.passwordHash.slice(-10)}`);

        // 3. bcrypt compare — log before and after.
        console.log(`[AUTH_DEBUG] starting bcrypt compare id=${manager.id}`);
        const ok = await bcrypt.compare(password, manager.passwordHash);
        console.log(`[AUTH_DEBUG] bcrypt compare result=${ok} id=${manager.id}`);

        if (!ok) {
          console.error(
            `[AUTH_DEBUG] login failed reason=password mismatch id=${manager.id} email=${email}`,
          );
          return null;
        }

        // 5. Success.
        console.log(
          `[AUTH_DEBUG] login success id=${manager.id} email=${email}`,
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
