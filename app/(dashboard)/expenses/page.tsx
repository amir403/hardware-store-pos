import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { prisma } from "@/app/lib/prisma";
import { getCurrentUser, hasRole } from "@/app/lib/auth";
import { getSettings } from "@/app/lib/settings";
import { formatDate, formatMoney, round2, toNum, isoDay } from "@/app/lib/format";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_LABELS,
  type ExpenseCategoryValue,
} from "@/app/lib/expense-categories";
import { deleteExpenseAction } from "@/app/actions/expenses";
import { PageHeader } from "@/app/components/page-header";
import { ExpenseForm } from "@/app/components/expenses/expense-form";
import { ConfirmForm } from "@/app/components/confirm-form";
import { Drawer } from "@/app/components/drawer";

export const metadata = { title: "Expenses" };

const METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  CARD: "Card",
  BANK_TRANSFER: "Bank",
  MOBILE: "Mobile",
  OTHER: "Other",
};

/** "YYYY-MM" for the month filter; anything else falls back to this month. */
function parseMonth(value: string | undefined, now: Date): Date {
  const match = value?.match(/^(\d{4})-(\d{2})$/);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, 1);
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

const monthParam = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; cat?: string; pay?: string; new?: string; edit?: string }>;
}) {
  const [user, settings, params] = await Promise.all([getCurrentUser(), getSettings(), searchParams]);
  const currency = settings.currency;

  const now = new Date();
  const monthStart = parseMonth(params.month, now);
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);
  const prevMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1);
  const isCurrentMonth = monthStart.getFullYear() === now.getFullYear() && monthStart.getMonth() === now.getMonth();
  const cat = (EXPENSE_CATEGORIES as readonly string[]).includes(params.cat ?? "")
    ? (params.cat as ExpenseCategoryValue)
    : "";
  const pay = Object.hasOwn(METHOD_LABELS, params.pay ?? "") ? (params.pay as string) : "";
  const canEdit = hasRole(user, "ADMIN", "MANAGER");
  const canDelete = hasRole(user, "ADMIN");

  const [expenses, lastMonth, editing] = await Promise.all([
    prisma.expense.findMany({
      where: { spentAt: { gte: monthStart, lt: monthEnd } },
      orderBy: { spentAt: "desc" },
      include: { user: { select: { name: true } } },
    }),
    prisma.expense.aggregate({
      where: { spentAt: { gte: prevMonth, lt: monthStart } },
      _sum: { amount: true },
    }),
    canEdit && params.edit ? prisma.expense.findUnique({ where: { id: params.edit } }) : null,
  ]);

  const sum = (rows: typeof expenses) => round2(rows.reduce((total, e) => total + toNum(e.amount), 0));
  const total = sum(expenses);
  const cashTotal = sum(expenses.filter((e) => e.method === "CASH"));
  const lastTotal = toNum(lastMonth._sum.amount);
  const change = round2(total - lastTotal);

  const byCategory = new Map<ExpenseCategoryValue, number>();
  for (const e of expenses) {
    byCategory.set(e.category, round2((byCategory.get(e.category) ?? 0) + toNum(e.amount)));
  }
  const categories = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);
  const shown = expenses.filter((e) => (!cat || e.category === cat) && (!pay || e.method === pay));

  const monthLabel = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(monthStart);
  const href = (changes: Record<string, string>) => {
    const next = new URLSearchParams();
    const merged = {
      month: isCurrentMonth ? "" : monthParam(monthStart),
      cat,
      pay,
      ...changes,
    };
    for (const [key, value] of Object.entries(merged)) if (value) next.set(key, value);
    const qs = next.toString();
    return qs ? `/expenses?${qs}` : "/expenses";
  };
  const listHref = href({});

  const stats = [
    {
      label: isCurrentMonth ? "Spent this month" : `Spent in ${monthLabel}`,
      value: formatMoney(total, currency),
      tone: "text-zinc-900",
      sub:
        lastTotal === 0 && total === 0
          ? "Nothing recorded"
          : `${change > 0 ? "+" : change < 0 ? "−" : ""}${formatMoney(Math.abs(change), currency)} vs ${new Intl.DateTimeFormat("en-GB", { month: "long" }).format(prevMonth)}`,
      link: null,
    },
    {
      label: "Taken from the drawer",
      value: formatMoney(cashTotal, currency),
      tone: cashTotal > 0 ? "text-amber-700" : "text-zinc-900",
      sub: "Lowers expected cash in the register",
      link: href({ pay: pay === "CASH" ? "" : "CASH" }),
    },
    {
      label: "Paid outside the drawer",
      value: formatMoney(round2(total - cashTotal), currency),
      tone: "text-zinc-900",
      sub: "Bank, card, mobile or other",
      link: null,
    },
  ];

  const chip = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition ${
      active ? "border-brand-700 bg-brand-700 text-white" : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300"
    }`;

  return (
    <>
      <PageHeader
        title="Expenses"
        description="Rent, salaries, bills and other shop running costs"
        actions={
          <Link
            href={href({ new: "1" })}
            scroll={false}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-4 text-sm font-medium text-white transition hover:bg-brand-800"
          >
            <PlusIcon className="h-4 w-4" /> New expense
          </Link>
        }
      />

      <div className="mb-4 flex items-center gap-1">
        <Link
          href={href({ month: monthParam(prevMonth) })}
          title="Previous month"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </Link>
        <span className="min-w-40 text-center text-sm font-semibold text-zinc-900">{monthLabel}</span>
        {isCurrentMonth ? (
          <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-100 text-zinc-300">
            <ChevronRightIcon className="h-4 w-4" />
          </span>
        ) : (
          <Link
            href={href({ month: monthParam(monthEnd) })}
            title="Next month"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </Link>
        )}
        {!isCurrentMonth && (
          <Link href={href({ month: "" })} className="ml-2 text-sm text-brand-700 hover:underline">
            This month
          </Link>
        )}
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {stats.map((stat) => {
          const body = (
            <>
              <p className="text-xs font-medium text-zinc-500">{stat.label}</p>
              <p className={`mt-1 text-lg font-semibold tabular-nums ${stat.tone}`}>{stat.value}</p>
              <p className="text-xs text-zinc-400">{stat.sub}</p>
            </>
          );
          return stat.link ? (
            <Link
              key={stat.label}
              href={stat.link}
              className={`rounded-xl border bg-white px-4 py-3 transition hover:border-zinc-300 ${pay === "CASH" ? "border-brand-600" : "border-zinc-200"}`}
            >
              {body}
            </Link>
          ) : (
            <div key={stat.label} className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
              {body}
            </div>
          );
        })}
      </div>

      {categories.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          <Link href={href({ cat: "" })} className={chip(!cat)}>
            All categories
          </Link>
          {categories.map(([category, amount]) => (
            <Link key={category} href={href({ cat: cat === category ? "" : category })} className={chip(cat === category)}>
              {EXPENSE_LABELS[category]}
              <span className={`tabular-nums ${cat === category ? "text-white/80" : "text-zinc-400"}`}>
                {formatMoney(amount, currency)}
              </span>
            </Link>
          ))}
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-1 text-sm">
        <span className="mr-1 text-zinc-500">Paid by:</span>
        {["", ...Object.keys(METHOD_LABELS)].map((key) => (
          <Link
            key={key || "all"}
            href={href({ pay: key })}
            className={`rounded-md px-2.5 py-1 transition ${pay === key ? "bg-zinc-900 font-medium text-white" : "text-zinc-600 hover:bg-zinc-100"}`}
          >
            {key ? METHOD_LABELS[key] : "Any"}
          </Link>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="w-full min-w-[640px] text-left text-sm">
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
            {shown.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-zinc-400">
                  {expenses.length === 0 ? `No expenses recorded in ${monthLabel}.` : "No expenses match these filters."}
                </td>
              </tr>
            )}
            {shown.map((expense) => (
              <tr key={expense.id} className={editing?.id === expense.id ? "bg-brand-50/60" : "hover:bg-zinc-50"}>
                <td className="whitespace-nowrap px-4 py-3 text-zinc-500">{formatDate(expense.spentAt)}</td>
                <td className="px-4 py-3">
                  <p className="font-medium text-zinc-900">{EXPENSE_LABELS[expense.category]}</p>
                  <p className="text-xs text-zinc-400">
                    {expense.note ? `${expense.note} · ` : ""}
                    {expense.user.name}
                  </p>
                </td>
                <td className="px-4 py-3">
                  {expense.method === "CASH" ? (
                    <span className="whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                      Cash · drawer
                    </span>
                  ) : (
                    <span className="text-zinc-600">{METHOD_LABELS[expense.method] ?? expense.method}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums text-zinc-900">
                  {formatMoney(toNum(expense.amount), currency)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    {canEdit && (
                      <Link
                        href={href({ edit: expense.id })}
                        scroll={false}
                        title="Edit expense"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-900"
                      >
                        <PencilIcon className="h-4 w-4" />
                      </Link>
                    )}
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
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          {shown.length > 1 && (
            <tfoot>
              <tr className="border-t border-zinc-200 bg-zinc-50 font-semibold text-zinc-900">
                <td colSpan={3} className="px-4 py-3">
                  {shown.length} expenses
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{formatMoney(sum(shown), currency)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {(params.new || editing) && (
        <Drawer title={editing ? "Edit expense" : "New expense"} closeHref={listHref}>
          <ExpenseForm
            key={editing?.id ?? "new"}
            today={isoDay(now)}
            doneHref={listHref}
            expense={
              editing
                ? {
                    id: editing.id,
                    category: editing.category,
                    amount: toNum(editing.amount),
                    method: editing.method,
                    spentOn: isoDay(editing.spentAt),
                    note: editing.note,
                  }
                : undefined
            }
          />
        </Drawer>
      )}
    </>
  );
}
