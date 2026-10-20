"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/app/lib/prisma";
import { getActionUser, hasRole } from "@/app/lib/auth";
import type { FormState } from "@/app/actions/products";

const ROLES = ["ADMIN", "MANAGER", "CASHIER"] as const;

const nameField = z
  .string()
  .trim()
  .max(80)
  .transform((v) => (v === "" ? null : v));

const passwordField = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(72, "Password must be at most 72 characters.");

const createUserSchema = z.object({
  name: nameField,
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: passwordField,
  role: z.enum(ROLES),
});

export async function createUserAction(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await getActionUser();
  if (!hasRole(user, "ADMIN")) {
    return { error: "Only administrators can manage users." };
  }

  const parsed = createUserSchema.safeParse({
    name: formData.get("name") ?? "",
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role"),
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const data = parsed.data;

  const existing = await prisma.user.findUnique({
    where: { email: data.email },
  });
  if (existing) {
    return { fieldErrors: { email: ["This email is already registered."] } };
  }

  try {
    await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        hashedPassword: await bcrypt.hash(data.password, 10),
        role: data.role,
      },
    });
  } catch (error) {
    console.error("createUser failed:", error);
    return { error: "Failed to create the user." };
  }

  revalidatePath("/users");
  return {};
}

const updateUserSchema = z.object({
  id: z.string().min(1),
  name: nameField,
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z
    .string()
    .transform((v) => (v === "" ? null : v))
    .refine((v) => v === null || v.length >= 8, {
      message: "Password must be at least 8 characters.",
    })
    .refine((v) => v === null || v.length <= 72, {
      message: "Password must be at most 72 characters.",
    }),
  role: z.enum(ROLES),
  isActive: z.boolean(),
});

export async function updateUserAction(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await getActionUser();
  if (!hasRole(user, "ADMIN")) {
    return { error: "Only administrators can manage users." };
  }

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing user id." };

  const parsed = updateUserSchema.safeParse({
    id,
    name: formData.get("name") ?? "",
    email: formData.get("email"),
    password: formData.get("password") ?? "",
    role: formData.get("role"),
    isActive: formData.get("isActive") === "on",
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const data = parsed.data;

  if (data.email === user.email && data.role !== user.role) {
    return { error: "You cannot change your own role." };
  }
  if (id === user.id && !data.isActive) {
    return { error: "You cannot deactivate your own account." };
  }

  const existing = await prisma.user.findFirst({
    where: { email: data.email, NOT: { id } },
  });
  if (existing) {
    return { fieldErrors: { email: ["This email is already registered."] } };
  }

  try {
    await prisma.user.update({
      where: { id },
      data: {
        name: data.name,
        email: data.email,
        role: data.role,
        isActive: data.isActive,
        ...(data.password
          ? { hashedPassword: await bcrypt.hash(data.password, 10) }
          : {}),
      },
    });
  } catch (error) {
    console.error("updateUser failed:", error);
    return { error: "Failed to update the user." };
  }

  revalidatePath("/users");
  return {};
}
