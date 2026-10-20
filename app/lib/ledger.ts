import { prisma } from "@/app/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";
import { round2, toNum } from "@/app/lib/format";

/**
 * Customer ledger math lives here and nowhere else, so the POS credit check,
 * the customers list and the ledger page can never disagree about what someone
 * owes.
 *
 * Balances are *derived* from invoices and payments — nothing is stored on the
 * Customer row. That is deliberate: a refund or a void then changes the balance
 * automatically, with no reconciliation step that could drift.
 */
export type CustomerBalance = {
  /** Sum of completed invoice totals. */
  billed: number;
  /** Counter payments plus every payment recorded afterwards. */
  collected: number;
  /** Positive = the customer owes us. Negative = they hold credit on account. */
  outstanding: number;
  /** Invoice value still unpaid, before account credit is applied. */
  invoiceDue: number;
};

const ZERO: CustomerBalance = {
  billed: 0,
  collected: 0,
  outstanding: 0,
  invoiceDue: 0,
};

export async function getCustomerBalances(
  customerIds: string[],
  // Pass the transaction client when checking credit *inside* a sale so the
  // figure can never come from a snapshot taken before the sale's own writes.
  client: Prisma.TransactionClient = prisma
): Promise<Map<string, CustomerBalance>> {
  const balances = new Map<string, CustomerBalance>();
  if (customerIds.length === 0) return balances;
  for (const id of customerIds) balances.set(id, { ...ZERO });

  const sales = await client.sale.findMany({
    where: { customerId: { in: customerIds }, status: "COMPLETED" },
    select: {
      id: true,
      customerId: true,
      total: true,
      paidAmount: true,
      payments: { select: { amount: true } },
    },
  });

  // Money paid in without being tied to a specific invoice.
  const onAccount = await client.customerPayment.groupBy({
    by: ["customerId"],
    where: { customerId: { in: customerIds }, saleId: null },
    _sum: { amount: true },
  });

  for (const row of onAccount) {
    if (!row.customerId) continue;
    const balance = balances.get(row.customerId);
    if (balance) balance.collected = round2(balance.collected + toNum(row._sum.amount));
  }

  for (const sale of sales) {
    const balance = sale.customerId ? balances.get(sale.customerId) : undefined;
    if (!balance) continue;

    const paidHere = round2(
      toNum(sale.paidAmount) +
        sale.payments.reduce((sum, p) => sum + toNum(p.amount), 0)
    );

    balance.billed = round2(balance.billed + toNum(sale.total));
    balance.collected = round2(balance.collected + paidHere);

    // An invoice never contributes a negative due: overpaying one leaves an
    // advance on the account rather than quietly settling someone else's bill.
    const net = round2(toNum(sale.total) - paidHere);
    balance.invoiceDue = round2(balance.invoiceDue + Math.max(0, net));
  }

  for (const balance of balances.values()) {
    // Net position. Overpaying one invoice leaves credit that genuinely offsets
    // another unpaid invoice, which is why this is not just the sum of dues.
    balance.outstanding = round2(balance.billed - balance.collected);
  }

  return balances;
}

export async function getCustomerBalance(
  customerId: string,
  client: Prisma.TransactionClient = prisma
): Promise<CustomerBalance> {
  const balances = await getCustomerBalances([customerId], client);
  return balances.get(customerId) ?? ZERO;
}

/** Everything currently lent out on credit — the receivables figure. */
export async function getTotalReceivables(): Promise<number> {
  const customers = await prisma.customer.findMany({ select: { id: true } });
  const balances = await getCustomerBalances(customers.map((c) => c.id));
  return round2(
    [...balances.values()].reduce(
      (sum, b) => sum + Math.max(0, b.outstanding),
      0
    )
  );
}
