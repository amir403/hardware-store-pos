"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/app/lib/prisma";
import { getActionUser, hasRole } from "@/app/lib/auth";
import { recordAudit } from "@/app/lib/audit";
import { round2 } from "@/app/lib/format";
import type { FormState } from "@/app/actions/products";
import { LABEL_SIZES, RECEIPT_PAPERS } from "@/app/lib/print-formats";

export type SettingsFormState = FormState & { savedAt?: number };

const settingsSchema = z.object({
  storeName: z.string().trim().min(1, "Store name is required").max(80),
  address: z
    .string()
    .trim()
    .max(200)
    .transform((v) => (v === "" ? null : v)),
  phone: z
    .string()
    .trim()
    .max(20)
    .transform((v) => (v === "" ? null : v)),
  currency: z.string().trim().min(1, "Currency is required").max(10),
  taxRate: z.coerce
    .number({ message: "Tax rate must be a number." })
    .min(0, "Tax rate cannot be negative.")
    .max(99.99, "Tax rate must be 99.99 or less."),
  pricesIncludeTax: z.boolean(),
  receiptFooter: z
    .string()
    .trim()
    .max(300)
    .transform((v) => (v === "" ? null : v)),
  receiptPaper: z.enum(Object.keys(RECEIPT_PAPERS) as [string, ...string[]]),
  labelSize: z.enum(Object.keys(LABEL_SIZES) as [string, ...string[]]),
  cashierMaxDiscountPct: z.coerce
    .number({ message: "Discount limit must be a number." })
    .min(0, "Discount limit cannot be negative.")
    .max(100, "Discount limit must be 100 or less."),
});

export async function updateSettingsAction(
  _prevState: SettingsFormState,
  formData: FormData
): Promise<SettingsFormState> {
  const user = await getActionUser();
  if (!hasRole(user, "ADMIN")) {
    return { error: "Only administrators can change store settings." };
  }

  const parsed = settingsSchema.safeParse({
    storeName: formData.get("storeName"),
    address: formData.get("address") ?? "",
    phone: formData.get("phone") ?? "",
    currency: formData.get("currency"),
    taxRate: formData.get("taxRate") ?? "0",
    pricesIncludeTax: formData.get("pricesIncludeTax") === "on",
    receiptFooter: formData.get("receiptFooter") ?? "",
    receiptPaper: formData.get("receiptPaper") ?? "80mm",
    labelSize: formData.get("labelSize") ?? "50x25",
    cashierMaxDiscountPct: formData.get("cashierMaxDiscountPct") ?? "10",
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const data = {
    storeName: parsed.data.storeName,
    address: parsed.data.address,
    phone: parsed.data.phone,
    currency: parsed.data.currency,
    taxRate: round2(parsed.data.taxRate),
    pricesIncludeTax: parsed.data.pricesIncludeTax,
    receiptFooter: parsed.data.receiptFooter,
    receiptPaper: parsed.data.receiptPaper,
    labelSize: parsed.data.labelSize,
    cashierMaxDiscountPct: round2(parsed.data.cashierMaxDiscountPct),
  };

  try {
    await prisma.settings.upsert({
      where: { id: "main" },
      update: data,
      create: { id: "main", ...data },
    });
    await recordAudit({
      userId: user.id,
      action: "settings.update",
      entityType: "Settings",
      entityId: "main",
      summary: "Store settings saved",
      details: data,
    });
  } catch (error) {
    console.error("updateSettings failed:", error);
    return { error: "Failed to save the settings." };
  }

  // Settings are rendered across the app (sidebar store name is static, but
  // receipts, POS totals and product defaults read them), so revalidate the
  // whole tree under the root layout.
  revalidatePath("/", "layout");

  return { savedAt: Date.now() };
}
