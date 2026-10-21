import { prisma } from "@/app/lib/prisma";
import { round2, toNum } from "@/app/lib/format";

/** Total spent between two instants (inclusive of `from`, exclusive of `to`). */
export async function getExpenseTotal(from: Date, to: Date): Promise<number> {
  const agg = await prisma.expense.aggregate({
    where: { spentAt: { gte: from, lt: to } },
    _sum: { amount: true },
  });
  return round2(toNum(agg._sum.amount));
}
