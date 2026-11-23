import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { createHash } from "node:crypto";
import { prisma } from "@/app/lib/prisma";

/**
 * Short digest of the stored password hash, kept in the (encrypted) session
 * token. A new password gives a new digest, so sessions from before it end.
 */
function passwordStamp(hashedPassword: string): string {
  return createHash("sha256").update(hashedPassword).digest("base64url").slice(0, 16);
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user?.hashedPassword || !user.isActive) return null;

        const valid = await bcrypt.compare(password, user.hashedPassword);
        if (!valid) return null;

        // Shown on the Users page; a failed write must not block the sign-in.
        await prisma.user
          .update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
          .catch(() => {});

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          passwordStamp: passwordStamp(user.hashedPassword),
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.passwordStamp = user.passwordStamp;
        return token;
      }
      // Re-checked on every request, so deactivating a user, deleting them or
      // resetting their password signs them out at once, and a role change
      // applies on their next click instead of when the token expires.
      if (typeof token.id !== "string") return null;
      const current = await prisma.user.findUnique({
        where: { id: token.id },
        select: { name: true, email: true, role: true, isActive: true, hashedPassword: true },
      });
      if (
        !current?.isActive ||
        !current.hashedPassword ||
        passwordStamp(current.hashedPassword) !== token.passwordStamp
      ) {
        return null;
      }
      token.role = current.role;
      token.name = current.name;
      token.email = current.email;
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as "ADMIN" | "MANAGER" | "CASHIER";
      }
      return session;
    },
  },
});
