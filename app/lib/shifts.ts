import { prisma } from "@/app/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";
import { round2, toNum } from "@/app/lib/format";

/** How the drawer's expected cash is made up. */
export type CashBreakdown = {
  openingFloat: number;
  /** Cash taken at the counter for completed sales. */
  cashSales: number;
  /** Cash received later against customer accounts. */
  cashCollections: number;
  /** Cash handed back on returns. */
  cashRefunds: number;
  /** Cash expenses paid out of the drawer. */
  cashExpenses: number;
  expected: number;
};

/** There is one drawer, so at most one shift is open at a time. */
export async function getOpenShift(client: Prisma.TransactionClient = prisma) {
  return client.shift.findFirst({
    where: { closedAt: null },
    orderBy: { openedAt: "desc" },
    include: { openedBy: { select: { name: true } } },
  });
}

/**
 * Cash that should be in the drawer for a shift, from the money that moved
 * while it was open. Card, bank and mobile payments never touch the drawer, so
 * only CASH rows count.
 */
export async function getCashBreakdown(
  shift: { openedAt: Date; openingFloat: unknown },
  until: Date,
  client: Prisma.TransactionClient = prisma
): Promise<CashBreakdown> {
  const window = { gte: shift.openedAt, lt: until };

  const [sales, collections, refunds, expenses] = await Promise.all([
    client.sale.aggregate({
      where: { status: "COMPLETED", paymentMethod: "CASH", createdAt: window },
      _sum: { paidAmount: true },
    }),
    client.customerPayment.aggregate({
      where: { method: "CASH", createdAt: window },
      _sum: { amount: true },
    }),
    client.saleReturn.aggregate({
      where: { refundMethod: "CASH", createdAt: window },
      _sum: { refundAmount: true },
    }),
    client.expense.aggregate({
      where: { method: "CASH", spentAt: window },
      _sum: { amount: true },
    }),
  ]);

  const openingFloat = round2(toNum(shift.openingFloat));
  const cashSales = round2(toNum(sales._sum.paidAmount));
  const cashCollections = round2(toNum(collections._sum.amount));
  const cashRefunds = round2(toNum(refunds._sum.refundAmount));
  const cashExpenses = round2(toNum(expenses._sum.amount));

  return {
    openingFloat,
    cashSales,
    cashCollections,
    cashRefunds,
    cashExpenses,
    expected: round2(
      openingFloat + cashSales + cashCollections - cashRefunds - cashExpenses
    ),
  };
}

/** A shift left open longer than this is flagged: one day's cash can no longer be counted on its own. */
export const STALE_SHIFT_HOURS = 24;

/** Whole hours a shift has been open, or null when it is not stale yet. */
export function staleShiftHours(openedAt: Date, now: Date = new Date()): number | null {
  const hours = Math.floor((now.getTime() - openedAt.getTime()) / 3_600_000);
  return hours >= STALE_SHIFT_HOURS ? hours : null;
}
