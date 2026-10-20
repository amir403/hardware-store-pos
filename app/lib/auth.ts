import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

export type Role = "ADMIN" | "MANAGER" | "CASHIER";

export type SessionUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  role: Role;
};

/** Returns the signed-in user or redirects to /login. Cached per render pass. */
export const getCurrentUser = cache(async (): Promise<SessionUser> => {
  const session = await auth();
  if (!session?.user?.id || !session?.user?.role) {
    redirect("/login");
  }
  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    role: session.user.role,
  };
});

/** Same as getCurrentUser but throws instead of redirecting (for server actions). */
export async function getActionUser(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user?.id || !session?.user?.role) {
    throw new Error("Unauthorized");
  }
  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    role: session.user.role,
  };
}

export function hasRole(user: SessionUser, ...roles: Role[]): boolean {
  return roles.includes(user.role);
}
