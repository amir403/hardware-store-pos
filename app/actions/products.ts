"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/app/lib/prisma";
import { getActionUser, hasRole } from "@/app/lib/auth";

export type FormState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

const productSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  sku: z
    .string()
    .trim()
    .max(40)
    .transform((v) => (v === "" ? null : v)),
  barcode: z
    .string()
    .trim()
    .max(60)
    .transform((v) => (v === "" ? null : v)),
  description: z
    .string()
    .trim()
    .max(500)
    .transform((v) => (v === "" ? null : v)),
  unit: z.string().trim().min(1).max(10),
  categoryId: z
    .string()
    .trim()
    .transform((v) => (v === "" || v === "none" ? null : v)),
  costPrice: z.coerce.number().min(0).max(99_999_999).default(0),
  price: z.coerce.number().min(0.01, "Price must be greater than 0").max(99_999_999),
  taxRate: z.coerce.number().min(0).max(100).default(0),
  stockQty: z.coerce.number().min(0).max(9_999_999).default(0),
  reorderLevel: z.coerce.number().min(0).max(9_999_999).default(0),
  trackStock: z.coerce.boolean().default(true),
});

const UNITS = ["pcs", "box", "kg", "ltr", "m", "yard", "cft", "hr"];

export async function createProductAction(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await getActionUser();
  if (!hasRole(user, "ADMIN", "MANAGER")) {
    return { error: "You are not allowed to manage products." };
  }

  const parsed = productSchema.safeParse({
    name: formData.get("name"),
    sku: formData.get("sku") ?? "",
    barcode: formData.get("barcode") ?? "",
    description: formData.get("description") ?? "",
    unit: formData.get("unit") ?? "pcs",
    categoryId: formData.get("categoryId") ?? "",
    costPrice: formData.get("costPrice") ?? 0,
    price: formData.get("price"),
    taxRate: formData.get("taxRate") ?? 0,
    stockQty: formData.get("stockQty") ?? 0,
    reorderLevel: formData.get("reorderLevel") ?? 0,
    trackStock: formData.get("trackStock") === "on",
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const data = parsed.data;

  if (data.sku) {
    const existing = await prisma.product.findUnique({ where: { sku: data.sku } });
    if (existing) {
      return {
        fieldErrors: { sku: ["A product with this SKU already exists."] },
      };
    }
  }

  if (data.barcode) {
    const existing = await prisma.product.findUnique({
      where: { barcode: data.barcode },
    });
    if (existing) {
      return {
        fieldErrors: { barcode: ["A product with this barcode already exists."] },
      };
    }
  }

  try {
    await prisma.product.create({
      data: {
        name: data.name,
        sku: data.sku,
        barcode: data.barcode,
        description: data.description,
        unit: UNITS.includes(data.unit) ? data.unit : "pcs",
        costPrice: data.costPrice,
        price: data.price,
        taxRate: data.taxRate,
        stockQty: data.trackStock ? data.stockQty : 0,
        reorderLevel: data.trackStock ? data.reorderLevel : null,
        trackStock: data.trackStock,
        categoryId: data.categoryId,
      },
    });
  } catch (error) {
    console.error("createProduct failed:", error);
    return { error: "Failed to create the product. Please try again." };
  }

  revalidatePath("/products");
  revalidatePath("/pos");
  redirect(`/products?created=1`);
}

export async function updateProductAction(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await getActionUser();
  if (!hasRole(user, "ADMIN", "MANAGER")) {
    return { error: "You are not allowed to manage products." };
  }

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing product id." };

  const parsed = productSchema.safeParse({
    name: formData.get("name"),
    sku: formData.get("sku") ?? "",
    barcode: formData.get("barcode") ?? "",
    description: formData.get("description") ?? "",
    unit: formData.get("unit") ?? "pcs",
    categoryId: formData.get("categoryId") ?? "",
    costPrice: formData.get("costPrice") ?? 0,
    price: formData.get("price"),
    taxRate: formData.get("taxRate") ?? 0,
    stockQty: formData.get("stockQty") ?? 0,
    reorderLevel: formData.get("reorderLevel") ?? 0,
    trackStock: formData.get("trackStock") === "on",
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const data = parsed.data;

  if (data.sku) {
    const existing = await prisma.product.findFirst({
      where: { sku: data.sku, NOT: { id } },
    });
    if (existing) {
      return {
        fieldErrors: { sku: ["A product with this SKU already exists."] },
      };
    }
  }

  if (data.barcode) {
    const existing = await prisma.product.findFirst({
      where: { barcode: data.barcode, NOT: { id } },
    });
    if (existing) {
      return {
        fieldErrors: { barcode: ["A product with this barcode already exists."] },
      };
    }
  }

  try {
    await prisma.product.update({
      where: { id },
      data: {
        name: data.name,
        sku: data.sku,
        barcode: data.barcode,
        description: data.description,
        unit: UNITS.includes(data.unit) ? data.unit : "pcs",
        costPrice: data.costPrice,
        price: data.price,
        taxRate: data.taxRate,
        reorderLevel: data.trackStock ? data.reorderLevel : null,
        trackStock: data.trackStock,
        categoryId: data.categoryId,
      },
    });
  } catch (error) {
    console.error("updateProduct failed:", error);
    return { error: "Failed to update the product. Please try again." };
  }

  revalidatePath("/products");
  revalidatePath(`/products/${id}`);
  revalidatePath("/pos");
  redirect(`/products?updated=1`);
}

export async function toggleProductActiveAction(formData: FormData) {
  const user = await getActionUser();
  if (!hasRole(user, "ADMIN", "MANAGER")) {
    throw new Error("Unauthorized");
  }

  const id = String(formData.get("id") ?? "");
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) return;

  await prisma.product.update({
    where: { id },
    data: { isActive: !product.isActive },
  });

  revalidatePath("/products");
  revalidatePath("/pos");
}
