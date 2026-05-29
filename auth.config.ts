import type { NextAuthConfig } from "next-auth";

// Edge-safe config: no DB, no bcrypt. Used by middleware.
export default {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    jwt: ({ token, user }) => {
      if (user) {
        token.id = (user as { id: string }).id;
        token.name = user.name ?? "";
        token.restaurantId = (user as { restaurantId: string }).restaurantId;
      }
      return token;
    },
    session: ({ session, token }) => {
      if (session.user) {
        (session.user as { id: string }).id = token.id as string;
        session.user.name = token.name as string;
        (session.user as { restaurantId: string }).restaurantId =
          token.restaurantId as string;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
