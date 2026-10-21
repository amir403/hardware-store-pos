import Link from "next/link";
import { Trash2Icon } from "lucide-react";
import { prisma } from "@/app/lib/prisma";
import { getCurrentUser, hasRole } from "@/app/lib/auth";
import { getSettings } from "@/app/lib/settings";
import { formatDate, formatMoney, round2, toNum } from "@/app/lib/format";
import {
  EXPENSE_LABELS,
  type ExpenseCategoryValue,
} from "@/app/lib/expense-categories";
import { deleteExpenseAction } from "@/app/actions/expenses";
import { PageHeader } from "@/app/components/page-header";
import { ExpenseForm } from "@/app/components/expenses/expense-form";
import { ConfirmForm } from "@/app/components/confirm-form";

export const metadata = { title: "Expenses" };

const METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  CARD: "Card",
  BANK_TRANSFER: "Bank",
  MOBILE: "Mobile",
  OTHER: "Other",
};

function isoDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** "YYYY-MM" for the month filter; anything else falls back to this month. */
function parseMonth(value: string | undefined, now: Date): Date {
  const match = value?.match(/^(\d{4})-(\d{2})$/);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, 1);
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const [user, settings, params] = await Promise.all([
    getCurrentUser(),
    getSettings(),
    searchParams,
  ]);
  const currency = settings.currency;

  const now = new Date();
  const monthStart = parseMonth(params.month, now);
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);
  const prevMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1);
  const isCurrentMonth =
    monthStart.getFullYear() === now.getFullYear() &&
    monthStart.getMonth() === now.getMonth();
  const monthParam = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

  const expenses = await prisma.expense.findMany({
    where: { spentAt: { gte: monthStart, lt: monthEnd } },
    orderBy: { spentAt: "desc" },
    include: { user: { select: { name: true } } },
  });

  const total = round2(expenses.reduce((sum, e) => sum + toNum(e.amount), 0));
  const byCategory = new Map<ExpenseCategoryValue, number>();
  for (const e of expenses) {
    byCategory.set(
      e.category,
      round2((byCategory.get(e.category) ?? 0) + toNum(e.amount))
    );
  }
  const categories = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);

  const canDelete = hasRole(user, "ADMIN");
  const monthLabel = new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
  }).format(monthStart);

  return (
    <>
      <PageHeader
        title="Expenses"
        description={`${monthLabel} · ${formatMoney(total, currency)} spent`}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href={`/expenses?month=${monthParam(prevMonth)}`}
              className="inline-flex h-9 items-center rounded-lg border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
            >
              ← Previous
            </Link>
            {!isCurrentMonth && (
              <Link
                href={`/expenses?month=${monthParam(new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1))}`}
                className="inline-flex h-9 items-center rounded-lg border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
              >
                Next →
              </Link>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          {categories.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {categories.map(([category, amount]) => (
                <div
                  key={category}
                  className="rounded-xl border border-zinc-200 bg-white p-4"
                >
                  <p className="truncate text-xs uppercase tracking-wide text-zinc-500">
                    {EXPENSE_LABELS[category]}
                  </p>
                  <p className="mt-1 text-lg font-semibold text-zinc-900">
                    {formatMoney(amount, currency)}
                  </p>
                </div>
              ))}
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
            <table className="w-full min-w-[640px] text-left lg:min-w-0 text-sm">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Paid by</th>
                  <th className="px-4 py-3 text-right font-medium">Amount</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {expenses.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-10 text-center text-sm text-zinc-400"
                    >
                      No expenses recorded in {monthLabel}.
                    </td>
                  </tr>
                )}
                {expenses.map((expense) => (
                  <tr key={expense.id} className="hover:bg-zinc-50">
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-500">
                      {formatDate(expense.spentAt)}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-zinc-900">
                        {EXPENSE_LABELS[expense.category]}
                      </p>
                      <p className="text-xs text-zinc-400">
                        {expense.note ? `${expense.note} · ` : ""}
                        {expense.user.name}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-zinc-600">
                      {METHOD_LABELS[expense.method] ?? expense.method}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-zinc-900">
                      {formatMoney(toNum(expense.amount), currency)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canDelete && (
                        <ConfirmForm
                          action={deleteExpenseAction}
                          successMessage="Expense removed"
                          message={`Remove this ${formatMoney(toNum(expense.amount), currency)} expense?`}
                        >
                          <input type="hidden" name="id" value={expense.id} />
                          <button
                            type="submit"
                            title="Remove expense"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2Icon className="h-4 w-4" />
                          </button>
                        </ConfirmForm>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="h-fit rounded-xl border border-zinc-200 bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold text-zinc-900">
            New expense
          </h2>
          <ExpenseForm today={isoDay(now)} />
        </div>
      </div>
    </>
  );
}
