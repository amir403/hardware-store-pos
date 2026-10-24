import { prisma } from "@/app/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";
import { round2, toNum } from "@/app/lib/format";

/**
 * Supplier ledger math — the mirror image of `ledger.ts`. What we owe each
 * supplier is *derived* from purchases and supplier payments; nothing is stored
 * on the Supplier row, so deleting a mistaken payment fixes every figure at once.
 */
export type SupplierBalance = {
  /** Sum of purchase totals from this supplier, less goods sent back. */
  purchased: number;
  /** Paid at the time of purchase plus every payment recorded afterwards. */
  paid: number;
  /** Positive = we owe the supplier. Negative = we have paid in advance. */
  outstanding: number;
  /** Purchase value still unpaid, before any advance is applied. */
  billDue: number;
};

const ZERO: SupplierBalance = {
  purchased: 0,
  paid: 0,
  outstanding: 0,
  billDue: 0,
};

/**
 * What has been paid against one purchase, what came back to the supplier, and
 * what is still owed on it.
 */
export function purchaseSettlement(purchase: {
  total: unknown;
  paidAmount: unknown;
  payments: { amount: unknown }[];
  returns: { amount: unknown }[];
}): { paid: number; returned: number; netTotal: number; due: number } {
  const paid = round2(
    toNum(purchase.paidAmount) +
      purchase.payments.reduce((sum, p) => sum + toNum(p.amount), 0)
  );
  const returned = round2(
    purchase.returns.reduce((sum, r) => sum + toNum(r.amount), 0)
  );
  const netTotal = round2(toNum(purchase.total) - returned);
  return { paid, returned, netTotal, due: round2(netTotal - paid) };
}

export async function getSupplierBalances(
  supplierIds: string[],
  client: Prisma.TransactionClient = prisma
): Promise<Map<string, SupplierBalance>> {
  const balances = new Map<string, SupplierBalance>();
  if (supplierIds.length === 0) return balances;
  for (const id of supplierIds) balances.set(id, { ...ZERO });

  const purchases = await client.purchase.findMany({
    where: { supplierId: { in: supplierIds } },
    select: {
      supplierId: true,
      total: true,
      paidAmount: true,
      payments: { select: { amount: true } },
      returns: { select: { amount: true } },
    },
  });

  // Money paid out without being tied to a specific purchase.
  const onAccount = await client.supplierPayment.groupBy({
    by: ["supplierId"],
    where: { supplierId: { in: supplierIds }, purchaseId: null },
    _sum: { amount: true },
  });

  for (const row of onAccount) {
    const balance = balances.get(row.supplierId);
    if (balance) balance.paid = round2(balance.paid + toNum(row._sum.amount));
  }

  for (const purchase of purchases) {
    const balance = purchase.supplierId
      ? balances.get(purchase.supplierId)
      : undefined;
    if (!balance) continue;

    const { paid, netTotal, due } = purchaseSettlement(purchase);
    balance.purchased = round2(balance.purchased + netTotal);
    balance.paid = round2(balance.paid + paid);
    // Overpaying one bill leaves an advance, it never shows as a negative due.
    balance.billDue = round2(balance.billDue + Math.max(0, due));
  }

  for (const balance of balances.values()) {
    balance.outstanding = round2(balance.purchased - balance.paid);
  }

  return balances;
}

export async function getSupplierBalance(
  supplierId: string,
  client: Prisma.TransactionClient = prisma
): Promise<SupplierBalance> {
  const balances = await getSupplierBalances([supplierId], client);
  return balances.get(supplierId) ?? ZERO;
}

/** Everything currently owed to suppliers — the payables figure. */
export async function getTotalPayables(): Promise<number> {
  const suppliers = await prisma.supplier.findMany({ select: { id: true } });
  const balances = await getSupplierBalances(suppliers.map((s) => s.id));
  return round2(
    [...balances.values()].reduce(
      (sum, b) => sum + Math.max(0, b.outstanding),
      0
    )
  );
}
