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
  CheckCircle2Icon,
  ChevronRightIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { prisma } from "@/app/lib/prisma";
import { getCurrentUser, hasRole } from "@/app/lib/auth";
import { getSettings } from "@/app/lib/settings";
import { formatMoney, formatDateTime, formatQty, toNum, round2, isoDay, PAYMENT_LABELS } from "@/app/lib/format";
import { getTotalReceivables, invoiceSettlement } from "@/app/lib/ledger";
import { getTotalPayables, purchaseSettlement } from "@/app/lib/payables";
import { getProfitSummary } from "@/app/lib/profit";
import { PageHeader } from "@/app/components/page-header";
import { getOpenShift } from "@/app/lib/shifts";
import { StaleShiftNotice } from "@/app/components/shifts/stale-shift-notice";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const settings = await getSettings();
  // Supplier balances are owner-level numbers, like the suppliers page itself.
  const canSeePayables = hasRole(user, "ADMIN", "MANAGER");

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const today = isoDay(now);
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
    heldCount,
    openQuotes,
    duePurchases,
    openShift,
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
    prisma.sale.count({ where: { status: "HELD" } }),
    prisma.quotation.findMany({
      where: { status: "OPEN", validUntil: { not: null } },
      select: { validUntil: true },
    }),
    canSeePayables
      ? prisma.purchase.findMany({
          where: { dueDate: { lt: startOfToday } },
          select: {
            total: true,
            paidAmount: true,
            payments: { select: { amount: true } },
            returns: { select: { amount: true } },
          },
        })
      : Promise.resolve([]),
    getOpenShift(),
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
      href: `/sales?from=${today}&to=${today}`,
    },
    {
      label: "This Month",
      value: formatMoney(monthRevenue, settings.currency),
      sub: `${monthAgg._count} transaction${monthAgg._count === 1 ? "" : "s"}`,
      icon: ReceiptTextIcon,
      href: `/sales?from=${isoDay(startOfMonth)}&to=${today}`,
    },
    {
      label: "Receivables",
      value: formatMoney(receivables, settings.currency),
      sub:
        overdueTotal > 0
          ? `${formatMoney(overdueTotal, settings.currency)} overdue`
          : "on credit accounts",
      icon: WalletIcon,
      href: "/customers?show=owing&sort=balance",
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
            href: "/suppliers?show=owed&sort=owed",
          },
          {
            label: "Stock value",
            value: formatMoney(stockValue, settings.currency),
            sub: "at current cost prices",
            icon: BoxesIcon,
            href: "/inventory",
          },
        ]
      : []),
    {
      label: "Active Products",
      value: String(productCount),
      sub: "items in catalog",
      icon: PackageIcon,
      href: "/products",
    },
    {
      label: "Low Stock",
      value: String(lowStock.length),
      sub: lowStock.length > 0 ? "need restocking" : "all stocked up",
      icon: AlertTriangleIcon,
      href: "/products?stock=low",
      alert: lowStock.length > 0,
    },
  ];

  // Things someone should act on today; each opens the list already filtered to it.
  const DAY = 24 * 60 * 60 * 1000;
  const expiredQuotes = openQuotes.filter((q) => q.validUntil! < now).length;
  const expiringQuotes = openQuotes.filter(
    (q) => q.validUntil! >= now && q.validUntil!.getTime() - now.getTime() < 3 * DAY
  ).length;
  const overduePurchases = duePurchases.map(purchaseSettlement).filter((p) => p.due > 0);
  const overduePayable = round2(overduePurchases.reduce((sum, p) => sum + p.due, 0));
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const tasks: { label: string; detail: string; href: string; tone: "red" | "amber" }[] = [
    ...(!openShift
      ? [{ label: "No shift is open", detail: "Open one so today's cash can be counted", href: "/shifts", tone: "amber" as const }]
      : []),
    ...(overdueSales.length > 0
      ? [{
          label: `${plural(overdueSales.length, "customer bill")} past the due date`,
          detail: `${formatMoney(overdueTotal, settings.currency)} to collect`,
          href: canSeePayables ? "/dues?show=overdue" : "/customers?show=owing&sort=balance",
          tone: "red" as const,
        }]
      : []),
    ...(overduePurchases.length > 0
      ? [{
          label: `${plural(overduePurchases.length, "supplier bill")} past the due date`,
          detail: `${formatMoney(overduePayable, settings.currency)} to pay`,
          href: "/purchases?show=overdue",
          tone: "red" as const,
        }]
      : []),
    ...(lowStock.length > 0
      ? [{
          label: `${plural(lowStock.length, "product")} at or below reorder level`,
          detail: canSeePayables ? "Draft a purchase order from the reorder list" : "Tell the manager to restock",
          href: canSeePayables ? "/inventory" : "/products?stock=low",
          tone: "amber" as const,
        }]
      : []),
    ...(heldCount > 0
      ? [{
          label: `${plural(heldCount, "bill")} on hold`,
          detail: "Finish or discard them at New Sale",
          href: "/sales?status=HELD",
          tone: "amber" as const,
        }]
      : []),
    ...(expiringQuotes > 0
      ? [{
          label: `${plural(expiringQuotes, "quotation")} expiring within 3 days`,
          detail: "Follow up with the customer",
          href: "/quotations?status=OPEN",
          tone: "amber" as const,
        }]
      : []),
    ...(expiredQuotes > 0
      ? [{
          label: `${plural(expiredQuotes, "open quotation")} already expired`,
          detail: "Convert, extend or cancel",
          href: "/quotations?status=EXPIRED",
          tone: "amber" as const,
        }]
      : []),
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

      <StaleShiftNotice shift={openShift} />

      <div className="mb-4 rounded-xl border border-zinc-200 bg-white">
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-zinc-900">Needs attention</h2>
          {tasks.length > 0 && <span className="text-xs text-zinc-400">{plural(tasks.length, "item")}</span>}
        </div>
        {tasks.length === 0 ? (
          <p className="flex items-center gap-2 px-5 py-4 text-sm text-emerald-700">
            <CheckCircle2Icon className="h-4 w-4" /> All clear. Nothing is overdue or waiting.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {tasks.map((task) => (
              <li key={task.label}>
                <Link href={task.href} className="flex items-center gap-3 px-5 py-2.5 transition hover:bg-zinc-50">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${task.tone === "red" ? "bg-red-500" : "bg-amber-500"}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-zinc-900">{task.label}</span>
                    <span className="block text-xs text-zinc-400">{task.detail}</span>
                  </span>
                  <ChevronRightIcon className="h-4 w-4 shrink-0 text-zinc-400" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          const body = (
            <>
              <div className="flex items-center justify-between">
                <p className="truncate text-xs font-medium text-zinc-500">
                  {card.label}
                </p>
                <Icon className="h-4 w-4 shrink-0 text-zinc-400" />
              </div>
              <p
                className={`mt-1 truncate text-base font-semibold tabular-nums tracking-tight sm:text-xl ${
                  card.alert ? "text-amber-700" : "text-zinc-900"
                }`}
              >
                {card.value}
              </p>
              <p className="truncate text-xs text-zinc-400">{card.sub}</p>
            </>
          );
          const className = `min-w-0 rounded-xl border bg-white px-4 py-3 ${
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
                <li key={product.id}>
                  <Link
                    href={`/products/${product.id}`}
                    className="flex items-center justify-between px-5 py-3 transition hover:bg-zinc-50"
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
                  </Link>
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
                  <span className="text-zinc-600">{PAYMENT_LABELS[payment.paymentMethod] ?? payment.paymentMethod}</span>
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

    </>
  );
}
