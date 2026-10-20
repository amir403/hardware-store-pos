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
  /** Sum of completed invoice totals, less goods returned. */
  billed: number;
  /** Counter payments plus every payment recorded afterwards. */
  collected: number;
  /** Positive = the customer owes us. Negative = they hold credit on account. */
  outstanding: number;
  /** Invoice value still unpaid, before account credit is applied. */
  invoiceDue: number;
};

/**
 * Where one invoice stands once returns are taken into account. Every page that
 * shows a per-invoice balance goes through this, so a return changes them all.
 */
export type InvoiceSettlement = {
  /** Invoice total less the value of goods brought back. */
  netTotal: number;
  /** Paid at the counter plus later payments, less cash refunded on returns. */
  settled: number;
  /** Positive = still owed on this invoice. */
  due: number;
  /** Value of goods returned against this invoice. */
  returned: number;
  /** Cash handed back on those returns. */
  refunded: number;
};

export function invoiceSettlement(sale: {
  total: unknown;
  paidAmount: unknown;
  payments: { amount: unknown }[];
  returns: { amount: unknown; refundAmount: unknown }[];
}): InvoiceSettlement {
  const returned = round2(
    sale.returns.reduce((sum, r) => sum + toNum(r.amount), 0)
  );
  const refunded = round2(
    sale.returns.reduce((sum, r) => sum + toNum(r.refundAmount), 0)
  );
  const netTotal = round2(toNum(sale.total) - returned);
  const settled = round2(
    toNum(sale.paidAmount) +
      sale.payments.reduce((sum, p) => sum + toNum(p.amount), 0) -
      refunded
  );
  return { netTotal, settled, due: round2(netTotal - settled), returned, refunded };
}

/** Prisma `select` fragment with everything `invoiceSettlement` reads. */
export const settlementSelect = {
  total: true,
  paidAmount: true,
  payments: { select: { amount: true } },
  returns: { select: { amount: true, refundAmount: true } },
} as const;

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
      ...settlementSelect,
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

    // Returned goods come off what was billed; cash handed back for them comes
    // off what was collected. Value not paid back stays as account credit.
    const { netTotal, settled, due } = invoiceSettlement(sale);

    balance.billed = round2(balance.billed + netTotal);
    balance.collected = round2(balance.collected + settled);

    // An invoice never contributes a negative due: overpaying one leaves an
    // advance on the account rather than quietly settling someone else's bill.
    balance.invoiceDue = round2(balance.invoiceDue + Math.max(0, due));
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
