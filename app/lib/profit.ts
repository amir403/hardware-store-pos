import { prisma } from "@/app/lib/prisma";
import { round2, toNum } from "@/app/lib/format";
import { getExpenseTotal } from "@/app/lib/expenses";

export type ProfitSummary = {
  /** Sales less returns. */
  revenue: number;
  /** Revenue less tax and the cost of the goods that left the shop. */
  grossProfit: number;
  expenses: number;
  /** What the shop actually made once running costs are paid. */
  netProfit: number;
};

/**
 * Profit for [from, to). Uses the same rules as the reports page: returns count
 * on the day the goods came back, and cost is each product's current cost
 * price (sale lines keep no cost snapshot), so this is an estimate.
 */
export async function getProfitSummary(
  from: Date,
  to: Date
): Promise<ProfitSummary> {
  const [sales, returns, expenses] = await Promise.all([
    prisma.sale.findMany({
      where: { status: "COMPLETED", createdAt: { gte: from, lt: to } },
      select: {
        total: true,
        taxAmount: true,
        items: {
          select: { quantity: true, product: { select: { costPrice: true } } },
        },
      },
    }),
    prisma.saleReturn.findMany({
      where: { sale: { status: "COMPLETED" }, createdAt: { gte: from, lt: to } },
      select: {
        amount: true,
        taxAmount: true,
        items: {
          select: { quantity: true, product: { select: { costPrice: true } } },
        },
      },
    }),
    getExpenseTotal(from, to),
  ]);

  const costOf = (
    items: { quantity: unknown; product: { costPrice: unknown } | null }[]
  ) =>
    items.reduce(
      (sum, item) => sum + toNum(item.quantity) * toNum(item.product?.costPrice),
      0
    );

  let revenue = 0;
  let tax = 0;
  let cost = 0;
  for (const sale of sales) {
    revenue += toNum(sale.total);
    tax += toNum(sale.taxAmount);
    cost += costOf(sale.items);
  }
  for (const ret of returns) {
    revenue -= toNum(ret.amount);
    tax -= toNum(ret.taxAmount);
    cost -= costOf(ret.items);
  }

  const grossProfit = round2(revenue - tax - cost);
  return {
    revenue: round2(revenue),
    grossProfit,
    expenses,
    netProfit: round2(grossProfit - expenses),
  };
}
