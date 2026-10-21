"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/app/lib/prisma";
import { getActionUser, hasRole } from "@/app/lib/auth";
import { round2, toNum } from "@/app/lib/format";
import { recordAudit } from "@/app/lib/audit";

export type SupplierPaymentResult = { ok: true } | { error: string };

const PAYMENT_METHODS = [
  "CASH",
  "CARD",
  "BANK_TRANSFER",
  "MOBILE",
  "OTHER",
] as const;

const supplierPaymentSchema = z.object({
  supplierId: z.string().min(1, "Choose a supplier first."),
  purchaseId: z.string().nullable().default(null),
  amount: z.coerce
    .number()
    .positive("Enter an amount greater than zero.")
    .max(99_999_999),
  method: z.enum(PAYMENT_METHODS).default("CASH"),
  note: z.string().max(300).optional(),
});

function revalidateSupplier(supplierId: string, purchaseId: string | null) {
  revalidatePath("/suppliers");
  revalidatePath(`/suppliers/${supplierId}`);
  revalidatePath("/purchases");
  revalidatePath("/");
  if (purchaseId) revalidatePath(`/purchases/${purchaseId}`);
}

/**
 * Record money paid out to a supplier. With a purchaseId it settles that
 * purchase; without one it sits on the account as an advance. Balances are
 * derived, so nothing else needs updating here.
 */
export async function paySupplierAction(
  _previous: SupplierPaymentResult | null,
  formData: FormData
): Promise<SupplierPaymentResult> {
  const user = await getActionUser();
  if (!hasRole(user, "ADMIN", "MANAGER")) {
    return { error: "You are not allowed to pay suppliers." };
  }

  const parsed = supplierPaymentSchema.safeParse({
    supplierId: String(formData.get("supplierId") ?? ""),
    purchaseId: String(formData.get("purchaseId") ?? "") || null,
    amount: String(formData.get("amount") ?? "").replace(/,/g, "").trim(),
    method: String(formData.get("method") ?? "CASH"),
    note: String(formData.get("note") ?? "").trim() || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid payment." };
  }
  const data = parsed.data;

  const supplier = await prisma.supplier.findUnique({
    where: { id: data.supplierId },
    select: { id: true },
  });
  if (!supplier) return { error: "That supplier no longer exists." };

  // A payment can only be pinned to a purchase from *this* supplier.
  if (data.purchaseId) {
    const purchase = await prisma.purchase.findFirst({
      where: { id: data.purchaseId, supplierId: supplier.id },
      select: { id: true },
    });
    if (!purchase) {
      return { error: "That purchase does not belong to this supplier." };
    }
  }

  await prisma.supplierPayment.create({
    data: {
      supplierId: supplier.id,
      purchaseId: data.purchaseId,
      amount: round2(data.amount),
      method: data.method,
      note: data.note,
      userId: user.id,
    },
  });

  revalidateSupplier(supplier.id, data.purchaseId);
  return { ok: true };
}

/** Remove a supplier payment recorded by mistake. Admin only, like receipts. */
export async function deleteSupplierPaymentAction(
  formData: FormData
): Promise<void> {
  const user = await getActionUser();
  if (!hasRole(user, "ADMIN")) {
    throw new Error("Only an admin can remove a recorded payment.");
  }

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const payment = await prisma.supplierPayment.findUnique({
    where: { id },
    select: {
      supplierId: true,
      purchaseId: true,
      amount: true,
      supplier: { select: { name: true } },
    },
  });
  if (!payment) return;

  await prisma.supplierPayment.delete({ where: { id } });
  await recordAudit({
    userId: user.id,
    action: "supplierPayment.delete",
    entityType: "Supplier",
    entityId: payment.supplierId,
    summary: `Removed a ${toNum(payment.amount)} payment to ${payment.supplier.name}`,
    details: {
      paymentId: id,
      amount: toNum(payment.amount),
      purchaseId: payment.purchaseId,
    },
  });

  revalidateSupplier(payment.supplierId, payment.purchaseId);
}
