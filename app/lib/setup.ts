import { prisma } from "@/app/lib/prisma";

/** True until the first user exists: a fresh install shows the setup screen instead of the login. */
export async function needsSetup(): Promise<boolean> {
  return (await prisma.user.count()) === 0;
}
