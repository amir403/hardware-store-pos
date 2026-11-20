import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { prisma } from "@/app/lib/prisma";
import { getCurrentUser, hasRole } from "@/app/lib/auth";
import { getSettings } from "@/app/lib/settings";
import { formatDate, formatMoney, formatQty, round2, toNum, PAYMENT_LABELS, isoDay } from "@/app/lib/format";
import { PageHeader } from "@/app/components/page-header";
import { PrintButton } from "@/app/components/print-button";
import { WhatsAppButton } from "@/app/components/whatsapp-button";
import { getProfitSummary } from "@/app/lib/profit";
import { getCashBreakdown } from "@/app/lib/shifts";
import { startOfDay } from "@/app/lib/sale-pricing";
import { dailyClosingText } from "@/app/lib/whatsapp";

export const metadata = { title: "Daily closing" };



/**
 * One day on one page: what was sold, how it was paid, what went out, and the
 * cash the drawer should have gained. Built for the owner's phone and for
 * printing at closing time.
 */
export default async function DailyClosingPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const user = await getCurrentUser();
  if (!hasRole(user, "ADMIN", "MANAGER")) redirect("/");

  const { date } = await searchParams;
  const today = startOfDay(new Date());
  // Local midnight, so the day never slips across time zones.
  const parsed = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00`) : today;
  const start = Number.isNaN(parsed.getTime()) || parsed > today ? today : parsed;
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
  const window = { gte: start, lt: end };
  const isToday = start.getTime() === today.getTime();

  const [settings, sales, byMethod, returns, collections, profit, cash, topItems, lowStock] =
    await Promise.all([
      getSettings(),
      prisma.sale.aggregate({
        where: { status: "COMPLETED", createdAt: window },
        _count: true,
        _sum: { total: true, paidAmount: true },
      }),
      prisma.sale.groupBy({
        by: ["paymentMethod"],
        where: { status: "COMPLETED", createdAt: window },
        _sum: { paidAmount: true },
      }),
      prisma.saleReturn.aggregate({
        where: { sale: { status: "COMPLETED" }, createdAt: window },
        _count: true,
        _sum: { amount: true },
      }),
      prisma.customerPayment.aggregate({ where: { createdAt: window }, _sum: { amount: true } }),
      getProfitSummary(start, end),
      // A shift-less view of the drawer: what cash came in and went out today.
      getCashBreakdown({ openedAt: start, openingFloat: 0 }, end),
      prisma.saleItem.groupBy({
        by: ["productName"],
        where: { sale: { status: "COMPLETED", createdAt: window } },
        _sum: { quantity: true, lineTotal: true },
        orderBy: { _sum: { lineTotal: "desc" } },
        take: 5,
      }),
      prisma.product.count({
        where: {
          isActive: true,
          trackStock: true,
          reorderLevel: { gt: 0 },
          // Same rule as the products page "Low stock" filter this links to.
          stockQty: { gt: 0, lte: prisma.product.fields.reorderLevel },
        },
      }),
    ]);

  const currency = settings.currency;
  const money = (n: number) => formatMoney(n, currency);
  const billed = round2(toNum(sales._sum.total));
  const paidAtCounter = round2(toNum(sales._sum.paidAmount));
  const creditGiven = round2(Math.max(0, billed - paidAtCounter));
  const collected = round2(toNum(collections._sum.amount));

  const cards: { label: string; value: string; note?: string; tone?: string }[] = [
    { label: "Sales", value: money(billed), note: `${sales._count} bill${sales._count === 1 ? "" : "s"}` },
    { label: "Cash in drawer", value: money(cash.expected), note: "net cash moved", tone: "text-emerald-700" },
    { label: "Credit given", value: money(creditGiven), note: "sold on udhaar", tone: creditGiven > 0 ? "text-amber-700" : undefined },
    { label: "Collected", value: money(collected), note: "paid against accounts" },
    { label: "Returns", value: money(round2(toNum(returns._sum.amount))), note: `${returns._count} return${returns._count === 1 ? "" : "s"}` },
    { label: "Expenses", value: money(profit.expenses) },
    { label: "Gross profit", value: money(profit.grossProfit) },
    { label: "Net profit", value: money(profit.netProfit), tone: profit.netProfit < 0 ? "text-red-600" : "text-emerald-700" },
  ];

  const shareText = dailyClosingText({
    storeName: settings.storeName,
    date: formatDate(start),
    bills: sales._count,
    lines: [
      ["Sale", money(billed)],
      ["Cash (galla)", money(cash.expected)],
      ["Udhaar diya", money(creditGiven)],
      ["Wasooli", money(collected)],
      ["Kharcha", money(profit.expenses)],
      ["Munafa", money(profit.netProfit)],
    ],
  });

  const dayLink = (offsetDays: number) =>
    `/reports/daily?date=${isoDay(new Date(start.getFullYear(), start.getMonth(), start.getDate() + offsetDays))}`;

  return (
    <>
      <PageHeader
        title="Daily closing"
        description={`${settings.storeName} · ${formatDate(start)}${isToday ? " (today, so far)" : ""}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <WhatsAppButton phone={null} text={shareText} label="Share" />
            <PrintButton label="Print" />
          </div>
        }
      />

      <nav className="mb-4 flex items-center gap-2 print:hidden" aria-label="Day">
        <Link
          href={dayLink(-1)}
          aria-label="Previous day"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-700 transition hover:bg-zinc-50"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </Link>
        <form action="/reports/daily">
          <input
            type="date"
            name="date"
            defaultValue={isoDay(start)}
            max={isoDay(today)}
            className="h-9 rounded-lg border border-zinc-300 bg-white px-2.5 text-sm text-zinc-900"
          />
          <button type="submit" className="ml-2 h-9 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
            Go
          </button>
        </form>
        {!isToday && (
          <Link
            href={dayLink(1)}
            aria-label="Next day"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-700 transition hover:bg-zinc-50"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </Link>
        )}
      </nav>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-xs font-medium text-zinc-500">{card.label}</p>
            <p className={`mt-1 text-lg font-semibold tabular-nums sm:text-xl ${card.tone ?? "text-zinc-900"}`}>
              {card.value}
            </p>
            {card.note && <p className="mt-0.5 text-xs text-zinc-400">{card.note}</p>}
          </div>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="rounded-xl border border-zinc-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-zinc-900">Paid at the counter</h2>
          {byMethod.length === 0 ? (
            <p className="text-sm text-zinc-400">No sales.</p>
          ) : (
            <dl className="flex flex-col gap-2 text-sm">
              {byMethod.map((row) => (
                <div key={row.paymentMethod} className="flex justify-between">
                  <dt className="text-zinc-600">{PAYMENT_LABELS[row.paymentMethod] ?? row.paymentMethod}</dt>
                  <dd className="font-medium tabular-nums text-zinc-900">{money(round2(toNum(row._sum.paidAmount)))}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-zinc-900">Cash drawer</h2>
          <dl className="flex flex-col gap-2 text-sm">
            {[
              ["Cash sales", cash.cashSales],
              ["Cash collected", cash.cashCollections],
              ["Cash refunds", 0 - cash.cashRefunds],
              ["Cash expenses", 0 - cash.cashExpenses],
            ].map(([label, amount]) => (
              <div key={label} className="flex justify-between">
                <dt className="text-zinc-600">{label}</dt>
                <dd className="tabular-nums text-zinc-900">{money(amount as number)}</dd>
              </div>
            ))}
            <div className="flex justify-between border-t border-zinc-100 pt-2 font-semibold">
              <dt>Net cash</dt>
              <dd className="tabular-nums">{money(cash.expected)}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-zinc-900">Top sellers <span className="font-normal text-zinc-400">(before returns)</span></h2>
          {topItems.length === 0 ? (
            <p className="text-sm text-zinc-400">Nothing sold.</p>
          ) : (
            <ol className="flex flex-col gap-2 text-sm">
              {topItems.map((item) => (
                <li key={item.productName} className="flex justify-between gap-3">
                  <span className="min-w-0 truncate text-zinc-700">
                    {item.productName}
                    <span className="text-zinc-400"> × {formatQty(toNum(item._sum.quantity))}</span>
                  </span>
                  <span className="shrink-0 font-medium tabular-nums text-zinc-900">
                    {money(round2(toNum(item._sum.lineTotal)))}
                  </span>
                </li>
              ))}
            </ol>
          )}
          {lowStock > 0 && (
            <Link
              href="/products?stock=low"
              className="mt-4 block rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 hover:bg-amber-100 print:hidden"
            >
              {lowStock} product{lowStock === 1 ? " is" : "s are"} running low →
            </Link>
          )}
        </section>
      </div>
    </>
  );
}
