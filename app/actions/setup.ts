"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/app/lib/prisma";
import { signIn } from "@/auth";
import { recordAudit } from "@/app/lib/audit";

export type SetupState = {
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  /** What was typed (never the passwords), so a rejected form keeps it. */
  values?: Record<string, string>;
};

const optional = z
  .string()
  .trim()
  .max(200)
  .transform((v) => (v === "" ? null : v));

const setupSchema = z
  .object({
    storeName: z.string().trim().min(1, "Enter the shop's name.").max(80),
    phone: optional,
    address: optional,
    currency: z.string().trim().min(1, "Enter a currency.").max(10),
    name: z.string().trim().min(1, "Enter your name.").max(80),
    email: z.string().trim().toLowerCase().email("Enter a valid email address."),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters.")
      .max(72, "Password must be at most 72 characters."),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, { path: ["confirm"], message: "The two passwords do not match." });

/**
 * First run on a new shop computer: store details plus the owner's admin
 * account, then straight into the app. Refuses once any user exists, so the
 * page cannot be used to add a second admin later.
 */
export async function completeSetupAction(_prev: SetupState, formData: FormData): Promise<SetupState> {
  const read = (keys: string[]) => Object.fromEntries(keys.map((k) => [k, String(formData.get(k) ?? "")]));
  const values = read(["storeName", "phone", "address", "currency", "name", "email"]);
  const input = { ...values, ...read(["password", "confirm"]) };
  const parsed = setupSchema.safeParse(input);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors, values };
  }
  const data = parsed.data;
  const hashedPassword = await bcrypt.hash(data.password, 10);

  const created = await prisma.$transaction(async (tx) => {
    // Two browsers submitting at once must not both become the first admin.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7240001)`;
    if ((await tx.user.count()) > 0) return null;

    await tx.settings.upsert({
      where: { id: "main" },
      create: { id: "main", storeName: data.storeName, phone: data.phone, address: data.address, currency: data.currency },
      update: { storeName: data.storeName, phone: data.phone, address: data.address, currency: data.currency },
    });
    const user = await tx.user.create({
      data: { name: data.name, email: data.email, hashedPassword, role: "ADMIN" },
    });
    await recordAudit(
      {
        userId: user.id,
        action: "user.create",
        entityType: "User",
        entityId: user.id,
        summary: `First-run setup: ${data.storeName}, admin ${data.email}`,
      },
      tx
    );
    return user;
  });

  if (!created) {
    return { error: "This shop is already set up. Sign in instead.", values };
  }

  await signIn("credentials", { email: data.email, password: data.password, redirect: false });
  redirect("/");
}
