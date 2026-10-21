"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/app/lib/prisma";
import { getActionUser, hasRole } from "@/app/lib/auth";
import type { FormState } from "@/app/actions/products";

/** Shared by customers and suppliers; credit is a customer-only addition. */
const partyFields = {
  name: z.string().trim().min(1, "Name is required").max(80),
  phone: z
    .string()
    .trim()
    .max(20)
    .transform((v) => (v === "" ? null : v)),
  email: z
    .string()
    .trim()
    .max(80)
    .transform((v) => (v === "" ? null : v)),
  address: z
    .string()
    .trim()
    .max(200)
    .transform((v) => (v === "" ? null : v)),
  notes: z
    .string()
    .trim()
    .max(300)
    .transform((v) => (v === "" ? null : v)),
};

const customerSchema = z.object({
  ...partyFields,
  /** Blank means "no cap", which is not the same as zero. */
  creditLimit: z
    .union([
      z.literal(""),
      z.literal(null),
      z.coerce.number().min(0, "Credit limit cannot be negative.").max(99_999_999),
    ])
    .transform((v) => (v === "" || v === null ? null : v)),
  priceTier: z.enum(["RETAIL", "WHOLESALE"]).default("RETAIL"),
});

const supplierSchema = z.object(partyFields);

/** Normalises FormData's `string | null` into what the party schemas expect. */
function partyInput(formData: FormData) {
  return {
    name: formData.get("name"),
    phone: formData.get("phone") ?? "",
    email: formData.get("email") ?? "",
    address: formData.get("address") ?? "",
    notes: formData.get("notes") ?? "",
  };
}

export async function createCustomerAction(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  await getActionUser();

  const parsed = customerSchema.safeParse({
    ...partyInput(formData),
    creditLimit: formData.get("creditLimit") ?? "",
    priceTier: formData.get("priceTier") === "WHOLESALE" ? "WHOLESALE" : "RETAIL",
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const data = parsed.data;

  if (data.phone) {
    const existing = await prisma.customer.findUnique({
      where: { phone: data.phone },
    });
    if (existing) {
      return { fieldErrors: { phone: ["This phone is already registered."] } };
    }
  }

  try {
    await prisma.customer.create({ data });
  } catch (error) {
    console.error("createCustomer failed:", error);
    return { error: "Failed to create the customer." };
  }

  revalidatePath("/customers");
  revalidatePath("/pos");
  return {};
}

export async function updateCustomerAction(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  await getActionUser();

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing customer id." };

  const parsed = customerSchema.safeParse({
    ...partyInput(formData),
    creditLimit: formData.get("creditLimit") ?? "",
    priceTier: formData.get("priceTier") === "WHOLESALE" ? "WHOLESALE" : "RETAIL",
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const data = parsed.data;

  if (data.phone) {
    const existing = await prisma.customer.findFirst({
      where: { phone: data.phone, NOT: { id } },
    });
    if (existing) {
      return { fieldErrors: { phone: ["This phone is already registered."] } };
    }
  }

  try {
    await prisma.customer.update({ where: { id }, data });
  } catch (error) {
    console.error("updateCustomer failed:", error);
    return { error: "Failed to update the customer." };
  }

  revalidatePath("/customers");
  return {};
}

export async function deleteCustomerAction(formData: FormData) {
  await getActionUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const [salesCount, paymentsCount] = await Promise.all([
    prisma.sale.count({ where: { customerId: id } }),
    prisma.customerPayment.count({ where: { customerId: id } }),
  ]);
  // Keep parties with history — deleting them would break the audit trail.
  if (salesCount > 0 || paymentsCount > 0) return;

  await prisma.customer.delete({ where: { id } });
  revalidatePath("/customers");
}

export async function createSupplierAction(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await getActionUser();
  if (!hasRole(user, "ADMIN", "MANAGER")) {
    return { error: "You are not allowed to manage suppliers." };
  }

  const parsed = supplierSchema.safeParse(partyInput(formData));

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  try {
    await prisma.supplier.create({ data: parsed.data });
  } catch (error) {
    console.error("createSupplier failed:", error);
    return { error: "Failed to create the supplier." };
  }

  revalidatePath("/suppliers");
  return {};
}

export async function updateSupplierAction(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await getActionUser();
  if (!hasRole(user, "ADMIN", "MANAGER")) {
    return { error: "You are not allowed to manage suppliers." };
  }

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing supplier id." };

  const parsed = supplierSchema.safeParse(partyInput(formData));

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  try {
    await prisma.supplier.update({ where: { id }, data: parsed.data });
  } catch (error) {
    console.error("updateSupplier failed:", error);
    return { error: "Failed to update the supplier." };
  }

  revalidatePath("/suppliers");
  return {};
}

export async function deleteSupplierAction(formData: FormData) {
  const user = await getActionUser();
  if (!hasRole(user, "ADMIN", "MANAGER")) {
    throw new Error("Unauthorized");
  }

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const purchasesCount = await prisma.purchase.count({
    where: { supplierId: id },
  });
  if (purchasesCount > 0) return;

  await prisma.supplier.delete({ where: { id } });
  revalidatePath("/suppliers");
}

export type QuickCustomer = {
  id: string;
  name: string;
  phone: string | null;
  priceTier: "RETAIL" | "WHOLESALE";
};

export type QuickCustomerResult = { customer: QuickCustomer } | { error: string };

const quickCustomerSchema = z.object({
  name: partyFields.name,
  phone: partyFields.phone,
  priceTier: z.enum(["RETAIL", "WHOLESALE"]).default("RETAIL"),
});

/**
 * Add a customer from the POS without leaving the sale: just a name, an
 * optional phone and the price tier. Everything else can be filled in later on
 * the Customers page.
 */
export async function quickCreateCustomerAction(input: {
  name: string;
  phone?: string;
  priceTier?: "RETAIL" | "WHOLESALE";
}): Promise<QuickCustomerResult> {
  await getActionUser();

  const parsed = quickCustomerSchema.safeParse({
    name: input.name,
    phone: input.phone ?? "",
    priceTier: input.priceTier,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid customer." };
  }
  const data = parsed.data;

  if (data.phone) {
    const existing = await prisma.customer.findUnique({
      where: { phone: data.phone },
      select: { name: true },
    });
    if (existing) {
      return { error: `${data.phone} already belongs to ${existing.name}.` };
    }
  }

  try {
    const customer = await prisma.customer.create({
      data: { name: data.name, phone: data.phone, priceTier: data.priceTier },
      select: { id: true, name: true, phone: true, priceTier: true },
    });
    revalidatePath("/customers");
    return { customer };
  } catch (error) {
    console.error("quickCreateCustomer failed:", error);
    return { error: "Failed to add the customer." };
  }
}
