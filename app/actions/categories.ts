"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/app/lib/prisma";
import { getActionUser, hasRole } from "@/app/lib/auth";
import type { FormState } from "@/app/actions/products";

const categorySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(50),
  description: z
    .string()
    .trim()
    .max(200)
    .transform((v) => (v === "" ? null : v)),
});

export async function createCategoryAction(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await getActionUser();
  if (!hasRole(user, "ADMIN", "MANAGER")) {
    return { error: "You are not allowed to manage categories." };
  }

  const parsed = categorySchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") ?? "",
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const existing = await prisma.category.findUnique({
    where: { name: parsed.data.name },
  });
  if (existing) {
    return { fieldErrors: { name: ["A category with this name already exists."] } };
  }

  try {
    await prisma.category.create({ data: parsed.data });
  } catch (error) {
    console.error("createCategory failed:", error);
    return { error: "Failed to create the category." };
  }

  revalidatePath("/categories");
  revalidatePath("/products");
  return { error: undefined, fieldErrors: undefined };
}

export async function renameCategoryAction(formData: FormData) {
  const user = await getActionUser();
  if (!hasRole(user, "ADMIN", "MANAGER")) {
    throw new Error("Unauthorized");
  }

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!id || !name) return;

  const existing = await prisma.category.findFirst({
    where: { name, NOT: { id } },
  });
  if (existing) {
    throw new Error(`A category named "${name}" already exists.`);
  }

  await prisma.category.update({ where: { id }, data: { name } });
  revalidatePath("/categories");
  revalidatePath("/products");
}

export async function deleteCategoryAction(formData: FormData) {
  const user = await getActionUser();
  if (!hasRole(user, "ADMIN", "MANAGER")) {
    throw new Error("Unauthorized");
  }

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  // Only allow deleting empty categories (products get categoryId SetNull,
  // but we prefer explicit guard so users don't accidentally orphan products).
  const productCount = await prisma.product.count({ where: { categoryId: id } });
  if (productCount > 0) return;

  await prisma.category.delete({ where: { id } });
  revalidatePath("/categories");
  revalidatePath("/products");
}
