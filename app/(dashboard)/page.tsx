import Link from "next/link";
import {
  BanknoteIcon,
  ReceiptTextIcon,
  PackageIcon,
  AlertTriangleIcon,
  ArrowRightIcon,
  BarChart3Icon,
  CreditCardIcon,
  BoxesIcon,
  DownloadIcon,
  WalletIcon,
  TruckIcon,
  PiggyBankIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { prisma } from "@/app/lib/prisma";
import { getCurrentUser, hasRole } from "@/app/lib/auth";
import { getSettings } from "@/app/lib/settings";
import { formatMoney, formatDateTime, formatQty, toNum, round2 } from "@/app/lib/format";
import { getTotalReceivables, invoiceSettlement } from "@/app/lib/ledger";
import { getTotalPayables } from "@/app/lib/payables";
import { getProfitSummary } from "@/app/lib/profit";
import { PageHeader } from "@/app/components/page-header";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const settings = await getSettings();
  // Supplier balances are owner-level numbers, like the suppliers page itself.
  const canSeePayables = hasRole(user, "ADMIN", "MANAGER");

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfSevenDaysAgo = new Date(startOfToday);
  startOfSevenDaysAgo.setDate(startOfSevenDaysAgo.getDate() - 6);

  const [
    todayAgg,
    monthAgg,
    productCount,
    lowStockProducts,
    recentSales,
    sevenDaySales,
    paymentSales,
    inventoryProducts,
    receivables,
    overdueCandidates,
    payables,
    recentReturns,
    todayProfit,
  ] = await Promise.all([
    prisma.sale.aggregate({
      where: { status: "COMPLETED", createdAt: { gte: startOfToday } },
      _sum: { total: true },
      _count: true,
    }),
    prisma.sale.aggregate({
      where: { status: "COMPLETED", createdAt: { gte: startOfMonth } },
      _sum: { total: true },
      _count: true,
    }),
    prisma.product.count({ where: { isActive: true } }),
    prisma.product.findMany({
      where: {
        isActive: true,
        trackStock: true,
        reorderLevel: { not: null },
      },
      orderBy: { stockQty: "asc" },
      take: 40,
    }),
    prisma.sale.findMany({
      where: { status: "COMPLETED" },
      orderBy: { createdAt: "desc" },
      take: 6,
      include: { user: { select: { name: true } } },
    }),
    prisma.sale.findMany({
      where: { status: "COMPLETED", createdAt: { gte: startOfSevenDaysAgo } },
      select: { createdAt: true, total: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.sale.groupBy({
      by: ["paymentMethod"],
      where: { status: "COMPLETED", createdAt: { gte: startOfMonth } },
      _sum: { total: true },
      _count: true,
      orderBy: { _sum: { total: "desc" } },
    }),
    prisma.product.findMany({
      where: { isActive: true, trackStock: true, costPrice: { not: null } },
      select: { stockQty: true, costPrice: true },
    }),
    // Money lent out on credit — derived from the ledger, not a stored figure.
    getTotalReceivables(),
    prisma.sale.findMany({
      where: {
        status: "COMPLETED",
        customerId: { not: null },
        dueDate: { not: null, lt: startOfToday },
      },
      select: {
        id: true,
        invoiceNo: true,
        total: true,
        paidAmount: true,
        dueDate: true,
        customer: { select: { name: true } },
        payments: { select: { amount: true } },
        returns: { select: { amount: true, refundAmount: true } },
      },
      orderBy: { dueDate: "asc" },
    }),
    canSeePayables ? getTotalPayables() : Promise.resolve(0),
    // Returns are counted on the day the goods came back, so they come off
    // that day's takings. The month always reaches back past the 7-day window.
    prisma.saleReturn.findMany({
      where: {
        sale: { status: "COMPLETED" },
        createdAt: {
          gte:
            startOfMonth < startOfSevenDaysAgo
              ? startOfMonth
              : startOfSevenDaysAgo,
        },
      },
      select: { createdAt: true, amount: true },
    }),
    // Profit is an owner-level number, like payables.
    canSeePayables
      ? getProfitSummary(
          startOfToday,
          new Date(startOfToday.getFullYear(), startOfToday.getMonth(), startOfToday.getDate() + 1)
        )
      : Promise.resolve(null),
  ]);

  const returnedSince = (from: Date, to?: Date) =>
    round2(
      recentReturns
        .filter((r) => r.createdAt >= from && (!to || r.createdAt < to))
        .reduce((sum, r) => sum + toNum(r.amount), 0)
    );

  const lowStock = lowStockProducts.filter(
    (p) => toNum(p.stockQty) <= toNum(p.reorderLevel)
  );
  const todayRevenue = round2(
    toNum(todayAgg._sum.total) - returnedSince(startOfToday)
  );
  const monthRevenue = round2(
    toNum(monthAgg._sum.total) - returnedSince(startOfMonth)
  );
  const salesByDay = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(startOfSevenDaysAgo);
    date.setDate(date.getDate() + index);
    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + 1);
    const revenue =
      sevenDaySales
        .filter((sale) => sale.createdAt >= date && sale.createdAt < nextDate)
        .reduce((sum, sale) => sum + toNum(sale.total), 0) -
      returnedSince(date, nextDate);
    return {
      label: new Intl.DateTimeFormat("en-GB", { weekday: "short" }).format(date),
      dateLabel: new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
      }).format(date),
      revenue,
    };
  });
  const maxDailyRevenue = Math.max(...salesByDay.map((day) => day.revenue), 1);
  const stockValue = inventoryProducts.reduce(
    (sum, product) => sum + toNum(product.stockQty) * toNum(product.costPrice),
    0
  );

  // An invoice only counts as overdue while it still has a balance left.
  const overdueSales = overdueCandidates
    .map((sale) => ({
      id: sale.id,
      invoiceNo: sale.invoiceNo,
      customerName: sale.customer?.name ?? "—",
      dueDate: sale.dueDate!,
      due: invoiceSettlement(sale).due,
    }))
    .filter((sale) => sale.due > 0);
  const overdueTotal = round2(
    overdueSales.reduce((sum, sale) => sum + sale.due, 0)
  );

  const cards: {
    label: string;
    value: string;
    sub: string;
    icon: LucideIcon;
    /** Optional jump target — the receivables card links to the ledger. */
    href?: string;
    /** Highlights the card when something needs attention. */
    alert?: boolean;
  }[] = [
    {
      label: "Today's Sales",
      value: formatMoney(todayRevenue, settings.currency),
      sub: `${todayAgg._count} transaction${todayAgg._count === 1 ? "" : "s"}`,
      icon: BanknoteIcon,
    },
    {
      label: "This Month",
      value: formatMoney(monthRevenue, settings.currency),
      sub: `${monthAgg._count} transaction${monthAgg._count === 1 ? "" : "s"}`,
      icon: ReceiptTextIcon,
    },
    {
      label: "Receivables",
      value: formatMoney(receivables, settings.currency),
      sub:
        overdueTotal > 0
          ? `${formatMoney(overdueTotal, settings.currency)} overdue`
          : "on credit accounts",
      icon: WalletIcon,
      href: "/customers",
      alert: overdueTotal > 0,
    },
    ...(todayProfit
      ? [
          {
            label: "Today's Net Profit",
            value: formatMoney(todayProfit.netProfit, settings.currency),
            sub:
              todayProfit.expenses > 0
                ? `${formatMoney(todayProfit.grossProfit, settings.currency)} gross − ${formatMoney(todayProfit.expenses, settings.currency)} expenses`
                : "no expenses recorded today",
            icon: PiggyBankIcon,
            href: "/reports",
            alert: todayProfit.netProfit < 0,
          },
        ]
      : []),
    ...(canSeePayables
      ? [
          {
            label: "Payables",
            value: formatMoney(payables, settings.currency),
            sub: "owed to suppliers",
            icon: TruckIcon,
            href: "/suppliers",
          },
        ]
      : []),
    {
      label: "Active Products",
      value: String(productCount),
      sub: "items in catalog",
      icon: PackageIcon,
    },
    {
      label: "Low Stock",
      value: String(lowStock.length),
      sub: lowStock.length > 0 ? "need restocking" : "all stocked up",
      icon: AlertTriangleIcon,
    },
  ];

  return (
    <>
      <PageHeader
        title={`Welcome back, ${user.name?.split(" ")[0] ?? "there"}`}
        description={`${settings.storeName} · ${new Intl.DateTimeFormat("en-GB", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        }).format(now)}`}
        actions={
          <Link
            href="/pos"
            className="inline-flex h-9 items-center rounded-lg bg-brand-700 px-4 text-sm font-medium text-white transition hover:bg-brand-800"
          >
            Start selling
          </Link>
        }
      />

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;
          const body = (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-zinc-500">
                  {card.label}
                </p>
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600">
                  <Icon className="h-4 w-4" />
                </span>
              </div>
              <p
                className={`mt-2 text-2xl font-semibold tracking-tight ${
                  card.alert ? "text-amber-700" : "text-zinc-900"
                }`}
              >
                {card.value}
              </p>
              <p className="mt-1 text-xs text-zinc-400">{card.sub}</p>
            </>
          );
          const className = `rounded-xl border bg-white p-5 ${
            card.alert ? "border-amber-200" : "border-zinc-200"
          }`;
          return card.href ? (
            <Link
              key={card.label}
              href={card.href}
              className={`${className} transition hover:border-zinc-300`}
            >
              {body}
            </Link>
          ) : (
            <div key={card.label} className={className}>
              {body}
            </div>
          );
        })}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* Recent sales */}
        <div className="rounded-xl border border-zinc-200 bg-white">
          <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-zinc-900">
              Recent Sales
            </h2>
            <Link
              href="/sales"
              className="flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-900"
            >
              View all <ArrowRightIcon className="h-3 w-3" />
            </Link>
          </div>
          {recentSales.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-sm text-zinc-400">No sales yet.</p>
            </div>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {recentSales.map((sale) => (
                <li key={sale.id}>
                  <Link
                    href={`/sales/${sale.id}`}
                    className="flex items-center justify-between px-5 py-3 transition hover:bg-zinc-50"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-zinc-900">
                        {sale.invoiceNo}
                      </p>
                      <p className="truncate text-xs text-zinc-400">
                        {formatDateTime(sale.createdAt)} ·{" "}
                        {sale.user.name ?? "Unknown"}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold text-zinc-900">
                      {formatMoney(toNum(sale.total), settings.currency)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Low stock */}
        <div className="rounded-xl border border-zinc-200 bg-white">
          <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-zinc-900">
              Low Stock Alerts
            </h2>
            {user.role !== "CASHIER" && (
              <Link
                href="/purchases/new"
                className="flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-900"
              >
                Record purchase <ArrowRightIcon className="h-3 w-3" />
              </Link>
            )}
          </div>
          {lowStock.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-sm text-zinc-400">
                All tracked products are above their reorder levels.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {lowStock.slice(0, 6).map((product) => (
                <li
                  key={product.id}
                  className="flex items-center justify-between px-5 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-900">
                      {product.name}
                    </p>
                    <p className="truncate text-xs text-zinc-400">
                      {product.sku ?? "No SKU"}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={`text-sm font-semibold ${
                        toNum(product.stockQty) === 0
                          ? "text-red-600"
                          : "text-amber-600"
                      }`}
                    >
                      {formatQty(toNum(product.stockQty))} {product.unit}
                    </p>
                    <p className="text-xs text-zinc-400">
                      reorder at {formatQty(toNum(product.reorderLevel))}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="rounded-xl border border-zinc-200 bg-white p-5 xl:col-span-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
                <BarChart3Icon className="h-4 w-4 text-zinc-500" />
                Sales trend
              </h2>
              <p className="mt-1 text-xs text-zinc-400">Completed sales over the last 7 days</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-400">{formatMoney(sevenDaySales.reduce((sum, sale) => sum + toNum(sale.total), 0), settings.currency)}</span>
              <a
                href={`/api/export/sales?from=${startOfSevenDaysAgo.toISOString().slice(0, 10)}&status=COMPLETED`}
                download
                className="inline-flex h-7 items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2 text-[11px] font-medium text-zinc-600 transition hover:bg-zinc-50 print:hidden"
                title="Download these 7 days as CSV"
              >
                <DownloadIcon className="h-3.5 w-3.5" />
                CSV
              </a>
            </div>
          </div>
          <div className="mt-6 flex h-40 items-end gap-2 sm:gap-4">
            {salesByDay.map((day) => (
              <div key={day.dateLabel} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                <span className="text-[10px] font-medium text-zinc-500">
                  {day.revenue > 0 ? formatMoney(day.revenue, settings.currency).replace(`${settings.currency} `, "") : "—"}
                </span>
                <div className="flex h-24 w-full items-end rounded-md bg-zinc-100">
                  <div
                    className="w-full rounded-md bg-brand-500 transition-all"
                    style={{ height: `${Math.max((day.revenue / maxDailyRevenue) * 100, day.revenue > 0 ? 8 : 0)}%` }}
                    title={`${day.dateLabel}: ${formatMoney(day.revenue, settings.currency)}`}
                  />
                </div>
                <span className="text-[10px] text-zinc-500">{day.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
            <CreditCardIcon className="h-4 w-4 text-zinc-500" />
            Payment methods
          </h2>
          <p className="mt-1 text-xs text-zinc-400">This month</p>
          {paymentSales.length === 0 ? (
            <p className="mt-8 text-center text-sm text-zinc-400">No payments yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-zinc-100">
              {paymentSales.map((payment) => (
                <li key={payment.paymentMethod} className="flex items-center justify-between py-3 text-sm">
                  <span className="text-zinc-600">{payment.paymentMethod.replaceAll("_", " ")}</span>
                  <span className="text-right">
                    <span className="block font-semibold text-zinc-900">{formatMoney(toNum(payment._sum.total), settings.currency)}</span>
                    <span className="text-xs text-zinc-400">{payment._count} transaction{payment._count === 1 ? "" : "s"}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
              <BoxesIcon className="h-4 w-4 text-zinc-500" />
              Inventory value
            </h2>
            <p className="mt-1 text-xs text-zinc-400">Estimated value using current product costs</p>
          </div>
          <p className="text-lg font-semibold text-zinc-900">{formatMoney(stockValue, settings.currency)}</p>
        </div>
      </div>
    </>
  );
}
