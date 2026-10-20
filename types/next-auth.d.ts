import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "ADMIN" | "MANAGER" | "CASHIER";
    } & DefaultSession["user"];
  }

  interface User {
    role?: "ADMIN" | "MANAGER" | "CASHIER";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: "ADMIN" | "MANAGER" | "CASHIER";
  }
}
