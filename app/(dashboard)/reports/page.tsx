import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BanknoteIcon,
  CoinsIcon,
  PiggyBankIcon,
  ReceiptTextIcon,
  DownloadIcon,
  ReceiptIcon,
  TrendingUpIcon,
  WalletIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { prisma } from "@/app/lib/prisma";
import { getCurrentUser, hasRole } from "@/app/lib/auth";
import { getSettings } from "@/app/lib/settings";
import { formatDate, formatMoney, formatQty, round2, toNum } from "@/app/lib/format";
import { PageHeader } from "@/app/components/page-header";
import { getExpenseTotal } from "@/app/lib/expenses";

export const metadata = { title: "Reports" };

const DAY_MS = 86_400_000;
const MAX_SERIES_DAYS = 92;

const PAYMENT_LABELS: Record<string, string> = {
  CASH: "Cash",
  CARD: "Card",
  BANK_TRANSFER: "Bank transfer",
  MOBILE: "Mobile",
  OTHER: "Other",
};

/** "YYYY-MM-DD" in local time, so a range never slips across midnight. */
function dayStart(value: string): Date {
  return new Date(`${value}T00:00:00`);
}

function dayEnd(value: string): Date {
  return new Date(`${value}T23:59:59`);
}

function isoDay(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function clampDate(value: string | undefined, fallback: string): string {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const user = await getCurrentUser();
  // Margins and cashier performance are owner-level numbers.
  if (!hasRole(user, "ADMIN", "MANAGER")) {
    redirect("/");
  }

  const params = await searchParams;
  const settings = await getSettings();
  const currency = settings.currency;

  const now = new Date();
  const today = isoDay(now);
  const defaultFrom = isoDay(new Date(now.getFullYear(), now.getMonth(), 1));

  const from = clampDate(params.from, defaultFrom);
  const to = clampDate(params.to, today);
  const fromAt = dayStart(from);
  const toAt = dayEnd(to);

  const sales = await prisma.sale.findMany({
    where: { status: "COMPLETED", createdAt: { gte: fromAt, lte: toAt } },
    select: {
      id: true,
      invoiceNo: true,
      total: true,
      paidAmount: true,
      discountAmount: true,
      taxAmount: true,
      paymentMethod: true,
      createdAt: true,
      customer: { select: { name: true } },
      user: { select: { name: true } },
      items: {
        select: {
          productName: true,
          quantity: true,
          lineTotal: true,
          product: {
            select: {
              costPrice: true,
              category: { select: { name: true } },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  // Goods brought back in the range, counted on the day they came back.
  const returns = await prisma.saleReturn.findMany({
    where: {
      sale: { status: "COMPLETED" },
      createdAt: { gte: fromAt, lte: toAt },
    },
    select: {
      amount: true,
      taxAmount: true,
      refundAmount: true,
      createdAt: true,
      sale: {
        select: { paymentMethod: true, user: { select: { name: true } } },
      },
      items: {
        select: {
          quantity: true,
          amount: true,
          saleItem: { select: { productName: true } },
          product: {
            select: {
              costPrice: true,
              category: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  // Running costs in the range; toAt is 23:59:59, so include that last second.
  const expenses = await getExpenseTotal(fromAt, new Date(toAt.getTime() + 1000));

  /* ---------- totals ---------- */

  const returned = round2(returns.reduce((sum, r) => sum + toNum(r.amount), 0));
  const revenue = round2(
    sales.reduce((sum, s) => sum + toNum(s.total), 0) - returned
  );
  const collected = round2(
    sales.reduce((sum, s) => sum + toNum(s.paidAmount), 0) -
      returns.reduce((sum, r) => sum + toNum(r.refundAmount), 0)
  );
  const discounts = round2(
    sales.reduce((sum, s) => sum + toNum(s.discountAmount), 0)
  );
  const taxes = round2(
    sales.reduce((sum, s) => sum + toNum(s.taxAmount), 0) -
      returns.reduce((sum, r) => sum + toNum(r.taxAmount), 0)
  );

  // Cost is taken from each product's CURRENT cost price: SaleItem keeps the
  // sale price but no cost snapshot, so this is a good estimate, not a filing
  // figure. A line whose product has no cost recorded counts as free stock.
  const costOf = (
    items: {
      quantity: unknown;
      product: { costPrice: unknown } | null;
    }[]
  ) =>
    round2(
      items.reduce(
        (sum, item) => sum + toNum(item.quantity) * toNum(item.product?.costPrice),
        0
      )
    );

  // Returned goods go back on the shelf, so their cost comes off too.
  const cost = round2(
    sales.reduce((sum, s) => sum + costOf(s.items), 0) -
      returns.reduce((sum, r) => sum + costOf(r.items), 0)
  );
  const grossProfit = round2(revenue - taxes - cost);
  const netProfit = round2(grossProfit - expenses);
  const margin = revenue > 0 ? round2((grossProfit / revenue) * 100) : 0;
  const avgBill = sales.length > 0 ? round2(revenue / sales.length) : 0;
  const creditGiven = round2(Math.max(0, revenue - collected));

  /* ---------- daily series ---------- */

  const spanDays = Math.min(
    MAX_SERIES_DAYS,
    Math.max(1, Math.round((toAt.getTime() - fromAt.getTime()) / DAY_MS) + 1)
  );
  const series = Array.from({ length: spanDays }, (_, index) => {
    const date = new Date(fromAt);
    date.setDate(date.getDate() + index);
    const next = new Date(date);
    next.setDate(next.getDate() + 1);
    const daySales = sales.filter(
      (s) => s.createdAt >= date && s.createdAt < next
    );
    const dayReturns = returns.filter(
      (r) => r.createdAt >= date && r.createdAt < next
    );
    const dayRevenue = round2(
      daySales.reduce((sum, s) => sum + toNum(s.total), 0) -
        dayReturns.reduce((sum, r) => sum + toNum(r.amount), 0)
    );
    return {
      date,
      label: new Intl.DateTimeFormat("en-GB", { day: "numeric" }).format(date),
      monthLabel: new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
      }).format(date),
      revenue: dayRevenue,
      profit: round2(
        dayRevenue -
          round2(
            daySales.reduce((sum, s) => sum + toNum(s.taxAmount), 0) -
              dayReturns.reduce((sum, r) => sum + toNum(r.taxAmount), 0)
          ) -
          daySales.reduce((sum, s) => sum + costOf(s.items), 0) +
          dayReturns.reduce((sum, r) => sum + costOf(r.items), 0)
      ),
      count: daySales.length,
    };
  });
  const peakDay = Math.max(...series.map((d) => d.revenue), 1);
  const bestDay = series.reduce(
    (best, day) => (day.revenue > best.revenue ? day : best),
    series[0]
  );

  /* ---------- breakdowns ---------- */

  type Group = { key: string; label: string; revenue: number; profit: number; qty: number; count: number };

  function tally(
    map: Map<string, Group>,
    key: string,
    label: string,
    revenue: number,
    profit: number,
    qty: number,
    count: number
  ) {
    const existing = map.get(key);
    if (existing) {
      existing.revenue = round2(existing.revenue + revenue);
      existing.profit = round2(existing.profit + profit);
      existing.qty = round2(existing.qty + qty);
      existing.count += count;
    } else {
      map.set(key, { key, label, revenue, profit, qty, count });
    }
  }

  const byProduct = new Map<string, Group>();
  const byCategory = new Map<string, Group>();
  const byCashier = new Map<string, Group>();
  const byMethod = new Map<string, Group>();

  for (const sale of sales) {
    const saleTax = toNum(sale.taxAmount);
    const saleCost = costOf(sale.items);
    const saleRevenue = toNum(sale.total);

    // Spread the bill's tax and cost across its lines by line value, so each
    // product's profit is measured the same way the whole shop's is.
    const lineShare =
      saleRevenue > 0 ? (lineTotal: number) => lineTotal / saleRevenue : () => 0;

    for (const item of sale.items) {
      const lineTotal = toNum(item.lineTotal);
      const share = lineShare(lineTotal);
      const itemProfit = round2(
        lineTotal -
          saleTax * share -
          toNum(item.quantity) * toNum(item.product?.costPrice)
      );
      const qty = toNum(item.quantity);

      tally(
        byProduct,
        item.productName,
        item.productName,
        round2(lineTotal * 1),
        itemProfit,
        qty,
        1
      );
      tally(
        byCategory,
        item.product?.category?.name ?? "Uncategorised",
        item.product?.category?.name ?? "Uncategorised",
        round2(lineTotal * 1),
        itemProfit,
        qty,
        1
      );
    }

    tally(
      byCashier,
      sale.user?.name ?? "Unknown",
      sale.user?.name ?? "Unknown",
      round2(saleRevenue),
      round2(saleRevenue - saleTax - saleCost),
      0,
      1
    );
    tally(
      byMethod,
      sale.paymentMethod,
      PAYMENT_LABELS[sale.paymentMethod] ?? sale.paymentMethod,
      round2(saleRevenue),
      round2(saleRevenue - saleTax - saleCost),
      0,
      1
    );
  }

  // Returns reverse their share of each breakdown without counting as a bill.
  for (const ret of returns) {
    const retAmount = toNum(ret.amount);
    const retTax = toNum(ret.taxAmount);
    const retCost = costOf(ret.items);

    for (const item of ret.items) {
      const value = toNum(item.amount);
      const share = retAmount > 0 ? value / retAmount : 0;
      const itemProfit = round2(
        value -
          retTax * share -
          toNum(item.quantity) * toNum(item.product?.costPrice)
      );
      const name = item.saleItem.productName;
      const category = item.product?.category?.name ?? "Uncategorised";
      tally(byProduct, name, name, -value, -itemProfit, -toNum(item.quantity), 0);
      tally(byCategory, category, category, -value, -itemProfit, -toNum(item.quantity), 0);
    }

    const retProfit = round2(retAmount - retTax - retCost);
    const cashier = ret.sale.user?.name ?? "Unknown";
    tally(byCashier, cashier, cashier, -retAmount, -retProfit, 0, 0);
    tally(
      byMethod,
      ret.sale.paymentMethod,
      PAYMENT_LABELS[ret.sale.paymentMethod] ?? ret.sale.paymentMethod,
      -retAmount,
      -retProfit,
      0,
      0
    );
  }

  const topProducts = [...byProduct.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);
  const categories = [...byCategory.values()].sort((a, b) => b.revenue - a.revenue);
  const cashiers = [...byCashier.values()].sort((a, b) => b.revenue - a.revenue);
  const methods = [...byMethod.values()].sort((a, b) => b.revenue - a.revenue);

  const cards: {
    label: string;
    value: string;
    sub: string;
    icon: LucideIcon;
    tone?: "good" | "warn";
  }[] = [
    {
      label: "Revenue",
      value: formatMoney(revenue, currency),
      sub:
        returned > 0
          ? `${sales.length} bill${sales.length === 1 ? "" : "s"} · ${formatMoney(returned, currency)} returned`
          : `${sales.length} bill${sales.length === 1 ? "" : "s"} · avg ${formatMoney(avgBill, currency)}`,
      icon: BanknoteIcon,
    },
    {
      label: "Gross profit",
      value: formatMoney(grossProfit, currency),
      sub: `${margin}% margin · est. from current cost prices`,
      icon: CoinsIcon,
      tone: grossProfit >= 0 ? "good" : "warn",
    },
    {
      label: "Expenses",
      value: formatMoney(expenses, currency),
      sub: "rent, bills, wages and other running costs",
      icon: ReceiptTextIcon,
    },
    {
      label: "Net profit",
      value: formatMoney(netProfit, currency),
      sub: "gross profit less expenses",
      icon: PiggyBankIcon,
      tone: netProfit >= 0 ? "good" : "warn",
    },
    {
      label: "Collected",
      value: formatMoney(collected, currency),
      sub:
        creditGiven > 0
          ? `${formatMoney(creditGiven, currency)} still on udhaar`
          : "everything paid in full",
      icon: WalletIcon,
    },
    {
      label: "Best day",
      value: bestDay && bestDay.revenue > 0 ? formatMoney(bestDay.revenue, currency) : "—",
      sub:
        bestDay && bestDay.revenue > 0
          ? `${formatDate(bestDay.date)} · ${bestDay.count} bill${bestDay.count === 1 ? "" : "s"}`
          : "no sales in this range",
      icon: TrendingUpIcon,
    },
  ];

  const ranges = [
    { label: "Today", from: today, to: today },
    {
      label: "7 days",
      from: isoDay(new Date(now.getTime() - 6 * DAY_MS)),
      to: today,
    },
    { label: "This month", from: defaultFrom, to: today },
    {
      label: "Last month",
      from: isoDay(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      to: isoDay(new Date(now.getFullYear(), now.getMonth(), 0)),
    },
    {
      label: "This year",
      from: isoDay(new Date(now.getFullYear(), 0, 1)),
      to: today,
    },
  ];

  return (
    <>
      <PageHeader
        title="Reports"
        description={`${formatDate(fromAt)} to ${formatDate(toAt)}`}
        actions={
          <Link
            href={`/api/export/sales?status=COMPLETED&from=${from}&to=${to}`}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
          >
            <DownloadIcon className="h-4 w-4" /> Export CSV
          </Link>
        }
      />

      {/* Range picker */}
      <div className="mb-6 flex flex-wrap items-center gap-2 print:hidden">
        {ranges.map((range) => {
          const active = range.from === from && range.to === to;
          return (
            <Link
              key={range.label}
              href={`/reports?from=${range.from}&to=${range.to}`}
              className={`inline-flex h-8 items-center rounded-lg border px-3 text-xs font-medium transition ${
                active
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
              }`}
            >
              {range.label}
            </Link>
          );
        })}

        <form action="/reports" method="GET" className="ml-auto flex items-center gap-2">
          <input
            type="date"
            name="from"
            defaultValue={from}
            className="h-8 rounded-lg border border-zinc-300 bg-white px-2 text-sm text-zinc-900 outline-none focus:border-zinc-900"
          />
          <span className="text-xs text-zinc-400">to</span>
          <input
            type="date"
            name="to"
            defaultValue={to}
            className="h-8 rounded-lg border border-zinc-300 bg-white px-2 text-sm text-zinc-900 outline-none focus:border-zinc-900"
          />
          <button
            type="submit"
            className="inline-flex h-8 items-center rounded-lg bg-zinc-900 px-3 text-xs font-medium text-white transition hover:bg-zinc-700"
          >
            Apply
          </button>
        </form>
      </div>

      {sales.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white px-6 py-16 text-center">
          <p className="text-sm font-medium text-zinc-900">
            No completed sales in this range.
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            Pick a different range above, or ring a sale at the counter.
          </p>
          <Link
            href="/pos"
            className="mt-5 inline-flex h-9 items-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-700"
          >
            New sale
          </Link>
        </div>
      ) : (
        <>
          {/* Headline numbers */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {cards.map((card) => {
              const Icon = card.icon;
              return (
                <div
                  key={card.label}
                  className="rounded-xl border border-zinc-200 bg-white p-5"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-zinc-500">{card.label}</p>
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600">
                      <Icon className="h-4 w-4" />
                    </span>
                  </div>
                  <p
                    className={`mt-2 text-2xl font-semibold tracking-tight ${
                      card.tone === "warn"
                        ? "text-red-700"
                        : card.tone === "good"
                          ? "text-emerald-700"
                          : "text-zinc-900"
                    }`}
                  >
                    {card.value}
                  </p>
                  <p className="mt-1 text-xs text-zinc-400">{card.sub}</p>
                </div>
              );
            })}
          </div>

          {/* Daily chart */}
          <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-zinc-900">
                Revenue by day
              </h2>
              <div className="flex items-center gap-4 text-xs text-zinc-500">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-zinc-900" /> revenue
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> gross
                  profit
                </span>
              </div>
            </div>
            <div
              className="flex items-end gap-1 overflow-x-auto"
              style={{ minHeight: "10rem" }}
            >
              {series.map((day) => {
                const height = Math.round((day.revenue / peakDay) * 100);
                const profitHeight =
                  day.revenue > 0
                    ? Math.round((Math.max(0, day.profit) / peakDay) * 100)
                    : 0;
                return (
                  <div
                    key={day.date.toISOString()}
                    className="flex min-w-6 flex-1 flex-col items-center justify-end gap-1"
                    title={`${formatDate(day.date)} · ${formatMoney(day.revenue, currency)} · ${day.count} bill${day.count === 1 ? "" : "s"}`}
                  >
                    <div
                      className="flex w-full items-end justify-center gap-0.5"
                      style={{ height: "8rem" }}
                    >
                      <div
                        className="w-1/2 rounded-t bg-zinc-900"
                        style={{ height: `${Math.max(height, day.revenue > 0 ? 2 : 0)}%` }}
                      />
                      <div
                        className="w-1/2 rounded-t bg-emerald-500"
                        style={{
                          height: `${Math.max(profitHeight, day.profit > 0 ? 2 : 0)}%`,
                        }}
                      />
                    </div>
                    <span className="text-[10px] text-zinc-400">{day.monthLabel}</span>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-zinc-400">
              {spanDays <
                Math.round((toAt.getTime() - fromAt.getTime()) / DAY_MS) + 1
                ? "Showing the first 92 days of the range."
                : ""}
            </p>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
            {/* Top products */}
            <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
              <div className="flex items-center gap-2 border-b border-zinc-100 px-4 py-3">
                <ReceiptIcon className="h-4 w-4 text-zinc-400" />
                <h2 className="text-sm font-semibold text-zinc-900">
                  Top selling products
                </h2>
              </div>
              <table className="w-full min-w-[640px] text-left lg:min-w-0 text-sm">
                <thead>
                  <tr className="border-b border-zinc-100 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                    <th className="px-4 py-2.5 font-medium">Product</th>
                    <th className="px-4 py-2.5 text-right font-medium">Qty</th>
                    <th className="px-4 py-2.5 text-right font-medium">Revenue</th>
                    <th className="px-4 py-2.5 text-right font-medium">Profit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {topProducts.map((product) => (
                    <tr key={product.key} className="hover:bg-zinc-50">
                      <td className="px-4 py-2.5 font-medium text-zinc-900">
                        {product.label}
                      </td>
                      <td className="px-4 py-2.5 text-right text-zinc-600">
                        {formatQty(product.qty)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-zinc-900">
                        {formatMoney(product.revenue, currency)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-emerald-700">
                        {formatMoney(product.profit, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Cashier-wise */}
            <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
              <div className="border-b border-zinc-100 px-4 py-3">
                <h2 className="text-sm font-semibold text-zinc-900">
                  Sales by cashier
                </h2>
              </div>
              <table className="w-full min-w-[640px] text-left lg:min-w-0 text-sm">
                <thead>
                  <tr className="border-b border-zinc-100 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                    <th className="px-4 py-2.5 font-medium">Cashier</th>
                    <th className="px-4 py-2.5 text-right font-medium">Bills</th>
                    <th className="px-4 py-2.5 text-right font-medium">Revenue</th>
                    <th className="px-4 py-2.5 text-right font-medium">Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {cashiers.map((cashier) => {
                    const share =
                      revenue > 0
                        ? Math.round((cashier.revenue / revenue) * 100)
                        : 0;
                    return (
                      <tr key={cashier.key} className="hover:bg-zinc-50">
                        <td className="px-4 py-2.5 font-medium text-zinc-900">
                          {cashier.label}
                        </td>
                        <td className="px-4 py-2.5 text-right text-zinc-600">
                          {cashier.count}
                        </td>
                        <td className="px-4 py-2.5 text-right text-zinc-900">
                          {formatMoney(cashier.revenue, currency)}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <span className="h-1.5 w-16 overflow-hidden rounded-full bg-zinc-100">
                              <span
                                className="block h-full rounded-full bg-zinc-900"
                                style={{ width: `${share}%` }}
                              />
                            </span>
                            <span className="w-9 text-right text-xs text-zinc-500">
                              {share}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Category mix */}
            <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
              <div className="border-b border-zinc-100 px-4 py-3">
                <h2 className="text-sm font-semibold text-zinc-900">
                  Category mix
                </h2>
              </div>
              <div className="flex flex-col gap-3 p-4">
                {categories.map((category) => {
                  const share =
                    revenue > 0
                      ? Math.round((category.revenue / revenue) * 100)
                      : 0;
                  return (
                    <div key={category.key}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-zinc-900">
                          {category.label}
                        </span>
                        <span className="text-zinc-500">
                          {formatMoney(category.revenue, currency)} · {share}%
                        </span>
                      </div>
                      <span className="mt-1 block h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
                        <span
                          className="block h-full rounded-full bg-zinc-900"
                          style={{ width: `${share}%` }}
                        />
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Payment mix */}
            <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
              <div className="border-b border-zinc-100 px-4 py-3">
                <h2 className="text-sm font-semibold text-zinc-900">
                  How customers paid
                </h2>
              </div>
              <table className="w-full min-w-[640px] text-left lg:min-w-0 text-sm">
                <thead>
                  <tr className="border-b border-zinc-100 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                    <th className="px-4 py-2.5 font-medium">Method</th>
                    <th className="px-4 py-2.5 text-right font-medium">Bills</th>
                    <th className="px-4 py-2.5 text-right font-medium">Revenue</th>
                    <th className="px-4 py-2.5 text-right font-medium">Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {methods.map((method) => {
                    const share =
                      revenue > 0
                        ? Math.round((method.revenue / revenue) * 100)
                        : 0;
                    return (
                      <tr key={method.key} className="hover:bg-zinc-50">
                        <td className="px-4 py-2.5 font-medium text-zinc-900">
                          {method.label}
                        </td>
                        <td className="px-4 py-2.5 text-right text-zinc-600">
                          {method.count}
                        </td>
                        <td className="px-4 py-2.5 text-right text-zinc-900">
                          {formatMoney(method.revenue, currency)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-zinc-500">
                          {share}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="border-t border-zinc-100 px-4 py-3 text-xs text-zinc-500">
                Discounts {formatMoney(discounts, currency)} · tax included{" "}
                {formatMoney(taxes, currency)} · estimated cost of goods{" "}
                {formatMoney(cost, currency)}
              </div>
            </div>
          </div>

          <p className="mt-4 text-xs text-zinc-400">
            Gross profit uses each product&apos;s current cost price against the
            sold quantity, so it is an estimate — a sale priced before a cost
            change will read slightly high or low.
          </p>
        </>
      )}
    </>
  );
}
