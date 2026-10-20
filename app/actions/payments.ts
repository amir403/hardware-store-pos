"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/app/lib/prisma";
import { getActionUser, hasRole } from "@/app/lib/auth";
import { round2 } from "@/app/lib/format";

export type PaymentResult = { ok: true } | { error: string };

const PAYMENT_METHODS = [
  "CASH",
  "CARD",
  "BANK_TRANSFER",
  "MOBILE",
  "OTHER",
] as const;

const receivePaymentSchema = z.object({
  customerId: z.string().min(1, "Choose a customer first."),
  saleId: z.string().nullable().default(null),
  amount: z.coerce
    .number()
    .positive("Enter an amount greater than zero.")
    .max(99_999_999),
  method: z.enum(PAYMENT_METHODS).default("CASH"),
  note: z.string().max(300).optional(),
});

/**
 * Record money coming in against a customer's account. With a saleId it settles
 * that invoice; without one the money sits on the account as an advance.
 * Balances are derived, so nothing else needs updating here.
 */
export async function receivePaymentAction(
  _previous: PaymentResult | null,
  formData: FormData
): Promise<PaymentResult> {
  const user = await getActionUser();

  const parsed = receivePaymentSchema.safeParse({
    customerId: String(formData.get("customerId") ?? ""),
    saleId: String(formData.get("saleId") ?? "") || null,
    amount: String(formData.get("amount") ?? "").replace(/,/g, "").trim(),
    method: String(formData.get("method") ?? "CASH"),
    note: String(formData.get("note") ?? "").trim() || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid payment." };
  }
  const data = parsed.data;

  const customer = await prisma.customer.findUnique({
    where: { id: data.customerId },
    select: { id: true, name: true },
  });
  if (!customer) return { error: "That customer no longer exists." };

  // A payment can only be pinned to an open invoice on *this* account, which
  // stops a mistargeted id silently settling somebody else's bill.
  if (data.saleId) {
    const sale = await prisma.sale.findFirst({
      where: {
        id: data.saleId,
        customerId: customer.id,
        status: "COMPLETED",
      },
      select: { id: true },
    });
    if (!sale) {
      return { error: "That invoice is not open on this account." };
    }
  }

  await prisma.customerPayment.create({
    data: {
      customerId: customer.id,
      saleId: data.saleId,
      amount: round2(data.amount),
      method: data.method,
      note: data.note,
      userId: user.id,
    },
  });

  revalidatePath("/customers");
  revalidatePath(`/customers/${customer.id}`);
  revalidatePath("/");
  revalidatePath("/pos");
  if (data.saleId) revalidatePath(`/sales/${data.saleId}`);

  return { ok: true };
}

/**
 * Remove a payment recorded by mistake. Admin only. The row is deleted rather
 * than reversed with a negative entry, because a phantom payment would clutter
 * the ledger with something that never happened.
 */
export async function deletePaymentAction(
  formData: FormData
): Promise<void> {
  const user = await getActionUser();
  if (!hasRole(user, "ADMIN")) {
    throw new Error("Only an admin can remove a recorded payment.");
  }

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const payment = await prisma.customerPayment.findUnique({
    where: { id },
    select: { customerId: true, saleId: true },
  });
  if (!payment) return;

  await prisma.customerPayment.delete({ where: { id } });

  revalidatePath("/customers");
  revalidatePath(`/customers/${payment.customerId}`);
  revalidatePath("/");
  revalidatePath("/pos");
  if (payment.saleId) revalidatePath(`/sales/${payment.saleId}`);
}
