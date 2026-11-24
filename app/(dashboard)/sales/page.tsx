import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon, DownloadIcon } from "lucide-react";
import type { PaymentMethod, Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/app/lib/prisma";
import { getSettings } from "@/app/lib/settings";
import { formatMoney, formatDateTime, isoDay, round2, toNum, PAYMENT_LABELS } from "@/app/lib/format";
import { PageHeader } from "@/app/components/page-header";
import { getT } from "@/app/lib/i18n-server";

export const metadata = { title: "Sales" };

const PAGE_SIZE = 50;

const STATUS_STYLES: Record<string, string> = {
  COMPLETED: "bg-emerald-50 text-emerald-700",
  HELD: "bg-amber-50 text-amber-700",
  REFUNDED: "bg-blue-50 text-blue-700",
  VOID: "bg-zinc-100 text-zinc-500",
};

const STATUS_LABELS: Record<string, string> = {
  COMPLETED: "Completed",
  HELD: "On hold",
  REFUNDED: "Refunded",
  VOID: "Void",
};

const STATUSES = ["COMPLETED", "HELD", "REFUNDED", "VOID"] as const;
type SaleStatusValue = (typeof STATUSES)[number];

const TABS: { value: "" | SaleStatusValue; label: string }[] = [
  { value: "", label: "All" },
  { value: "COMPLETED", label: "Completed" },
  { value: "HELD", label: "On hold" },
  { value: "REFUNDED", label: "Refunded" },
  { value: "VOID", label: "Voided" },
];

/** A yyyy-mm-dd string, or "" when it is not a real date. */
function validDay(value: string | undefined): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d).getMonth() === m - 1 ? value : "";
}

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; from?: string; to?: string; pay?: string; page?: string }>;
}) {
  const [settings, params, t] = await Promise.all([getSettings(), searchParams, getT()]);

  const q = params.q?.trim() ?? "";
  // Ignore anything that is not a real status so the query stays parameterised.
  const status: "" | SaleStatusValue = STATUSES.includes(params.status as SaleStatusValue)
    ? (params.status as SaleStatusValue)
    : "";
  const pay = params.pay && Object.hasOwn(PAYMENT_LABELS, params.pay) ? (params.pay as PaymentMethod) : "";
  const from = validDay(params.from);
  const to = validDay(params.to);
  const page = Math.max(1, Math.floor(Number(params.page)) || 1);

  const filters = { q, status, pay, from, to };
  // Every link keeps the other filters; changing one goes back to page 1.
  const href = (changes: Partial<Record<keyof typeof filters | "page", string>>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...filters, page: "", ...changes })) {
      if (value) next.set(key, value);
    }
    const query = next.toString();
    return query ? `/sales?${query}` : "/sales";
  };
  const exportQuery = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();

  const today = new Date();
  const daysAgo = (n: number) => isoDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() - n));
  const ranges = [
    { label: "Today", from: daysAgo(0), to: daysAgo(0) },
    { label: "Yesterday", from: daysAgo(1), to: daysAgo(1) },
    { label: "7 days", from: daysAgo(6), to: daysAgo(0) },
    { label: "This month", from: isoDay(new Date(today.getFullYear(), today.getMonth(), 1)), to: daysAgo(0) },
    { label: "All time", from: "", to: "" },
  ];

  const where: Prisma.SaleWhereInput = {
    ...(q
      ? {
          OR: [
            { invoiceNo: { contains: q, mode: "insensitive" } },
            { customer: { name: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
    ...(status ? { status } : {}),
    ...(pay ? { paymentMethod: pay } : {}),
    ...(from || to
      ? {
          createdAt: {
            ...(from ? { gte: new Date(`${from}T00:00:00`) } : {}),
            ...(to ? { lte: new Date(`${to}T23:59:59.999`) } : {}),
          },
        }
      : {}),
  };
  // Money figures only make sense for completed bills, whatever tab is open.
  const showTotals = status === "" || status === "COMPLETED";

  const [sales, count, byPayment] = await Promise.all([
    prisma.sale.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        user: { select: { name: true } },
        customer: { select: { name: true } },
        _count: { select: { items: true } },
      },
    }),
    prisma.sale.count({ where }),
    showTotals
      ? prisma.sale.groupBy({
          by: ["paymentMethod"],
          where: { ...where, status: "COMPLETED" },
          _sum: { total: true },
          _count: true,
        })
      : Promise.resolve([]),
  ]);

  const revenue = round2(byPayment.reduce((sum, row) => sum + toNum(row._sum.total), 0));
  const bills = byPayment.reduce((sum, row) => sum + row._count, 0);
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const rangeLabel = ranges.find((r) => r.from === from && r.to === to)?.label;

  return (
    <>
      <PageHeader
        title={t("Sales")}
        description={`${t(count === 1 ? "1 bill" : "{n} bills", { n: count })}${rangeLabel && from ? ` · ${t(rangeLabel)}` : from || to ? ` · ${from || t("start")} – ${to || t("today")}` : ""}`}
        actions={
          // Plain anchor, not Link: a download must be a real navigation.
          <a
            href={`/api/export/sales${exportQuery ? `?${exportQuery}` : ""}`}
            download
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
            title={t("Download this list as CSV")}
          >
            <DownloadIcon className="h-4 w-4" />
            CSV
          </a>
        }
      />

      {/* Period */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex h-10 max-w-full items-center gap-1 overflow-x-auto rounded-lg border border-zinc-200 bg-white p-1">
          {ranges.map((range) => {
            const active = range.from === from && range.to === to;
            return (
              <Link
                key={range.label}
                href={href({ from: range.from, to: range.to })}
                className={`whitespace-nowrap rounded-md px-3 py-1 text-sm transition ${
                  active ? "bg-brand-700 font-medium text-white" : "text-zinc-600 hover:bg-zinc-100"
                }`}
              >
                {t(range.label)}
              </Link>
            );
          })}
        </div>
        <form action="/sales" className="flex flex-wrap items-center gap-2">
          {Object.entries({ q, status, pay }).map(([name, value]) =>
            value ? <input key={name} type="hidden" name={name} value={value} /> : null
          )}
          <input
            type="date"
            name="from"
            defaultValue={from}
            max={daysAgo(0)}
            aria-label="From date"
            className="h-10 rounded-lg border border-zinc-300 bg-white px-2 text-sm outline-none focus:border-brand-600"
          />
          <span className="text-zinc-400">–</span>
          <input
            type="date"
            name="to"
            defaultValue={to}
            max={daysAgo(0)}
            aria-label="To date"
            className="h-10 rounded-lg border border-zinc-300 bg-white px-2 text-sm outline-none focus:border-brand-600"
          />
          <button
            type="submit"
            className="h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            {t("Apply")}
          </button>
        </form>
      </div>

      {showTotals && (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
            <p className="text-xs font-medium text-zinc-500">{t("Sales")}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-zinc-900">{formatMoney(revenue, settings.currency)}</p>
            <p className="text-xs text-zinc-400">{t("Completed bills, before returns")}</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
            <p className="text-xs font-medium text-zinc-500">{t("Bills")}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-zinc-900">{bills}</p>
            <p className="text-xs text-zinc-400">
              {t("Average")} {formatMoney(bills ? round2(revenue / bills) : 0, settings.currency)}
            </p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 lg:col-span-2">
            <p className="text-xs font-medium text-zinc-500">{t("By payment")}</p>
            {byPayment.length === 0 ? (
              <p className="mt-1 text-sm text-zinc-400">{t("No completed bills in this view.")}</p>
            ) : (
              <div className="mt-1.5 flex flex-wrap gap-2">
                {byPayment
                  .sort((a, b) => toNum(b._sum.total) - toNum(a._sum.total))
                  .map((row) => (
                    <Link
                      key={row.paymentMethod}
                      href={href({ pay: pay === row.paymentMethod ? "" : row.paymentMethod })}
                      title={pay === row.paymentMethod ? "Show every payment type" : `Only ${PAYMENT_LABELS[row.paymentMethod]}`}
                      className={`rounded-lg border px-2.5 py-1 text-sm transition ${
                        pay === row.paymentMethod
                          ? "border-brand-600 bg-brand-50 text-brand-900"
                          : "border-zinc-200 text-zinc-700 hover:border-zinc-300"
                      }`}
                    >
                      {t(PAYMENT_LABELS[row.paymentMethod] ?? row.paymentMethod)}{" "}
                      <span className="font-semibold tabular-nums">{formatMoney(toNum(row._sum.total), settings.currency)}</span>
                    </Link>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1">
          {TABS.map((tab) => (
            <Link
              key={tab.value || "all"}
              href={href({ status: tab.value })}
              className={`inline-flex h-8 items-center rounded-lg px-3 text-sm font-medium transition ${
                tab.value === status
                  ? "bg-brand-700 text-white"
                  : "border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              {t(tab.label)}
            </Link>
          ))}
          {pay && (
            <Link
              href={href({ pay: "" })}
              className="ml-1 inline-flex h-8 items-center gap-1 rounded-lg border border-brand-600 bg-brand-50 px-3 text-sm text-brand-900"
              title={t("Show every payment type")}
            >
              {t(PAYMENT_LABELS[pay])} ×
            </Link>
          )}
        </div>
        <form action="/sales" className="w-full sm:w-80">
          {Object.entries({ status, pay, from, to }).map(([name, value]) =>
            value ? <input key={name} type="hidden" name={name} value={value} /> : null
          )}
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder={t("Search by invoice no or customer…")}
            className="h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15"
          />
        </form>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-100 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <th className="px-4 py-3 font-medium">{t("Invoice")}</th>
              <th className="px-4 py-3 font-medium">{t("Date")}</th>
              <th className="px-4 py-3 font-medium">{t("Customer")}</th>
              <th className="px-4 py-3 font-medium">{t("Cashier")}</th>
              <th className="px-4 py-3 font-medium">{t("Payment")}</th>
              <th className="px-4 py-3 font-medium">{t("Status")}</th>
              <th className="px-4 py-3 text-right font-medium">{t("Total")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {sales.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-zinc-400">
                  {t("No sales in this view.")}
                </td>
              </tr>
            )}
            {sales.map((sale) => (
              <tr key={sale.id} className="relative hover:bg-zinc-50">
                <td className="whitespace-nowrap px-4 py-3">
                  {/* Stretched over the row: a click anywhere opens the bill. */}
                  <Link
                    href={`/sales/${sale.id}`}
                    className="font-medium text-zinc-900 after:absolute after:inset-0 after:content-['']"
                  >
                    {sale.invoiceNo}
                  </Link>
                  <span className="block text-xs text-zinc-400">
                    {t(sale._count.items === 1 ? "1 item" : "{n} items", { n: sale._count.items })}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-zinc-600">{formatDateTime(sale.createdAt)}</td>
                <td className="px-4 py-3 text-zinc-700">
                  {sale.customer?.name ?? <span className="text-zinc-400">{t("Walk-in")}</span>}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-zinc-600">{sale.user.name ?? "—"}</td>
                <td className="whitespace-nowrap px-4 py-3 text-zinc-600">
                  {t(PAYMENT_LABELS[sale.paymentMethod] ?? sale.paymentMethod)}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${
                      STATUS_STYLES[sale.status] ?? "bg-zinc-100 text-zinc-600"
                    }`}
                  >
                    {t(STATUS_LABELS[sale.status] ?? sale.status)}
                  </span>
                </td>
                <td
                  className={`whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums ${
                    sale.status === "VOID" ? "text-zinc-400 line-through" : "text-zinc-900"
                  }`}
                >
                  {formatMoney(toNum(sale.total), settings.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {count > 0 && (
          <div className="flex items-center justify-between border-t border-zinc-100 px-4 py-2.5 text-sm text-zinc-500">
            <span>
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, count)} / {count}
            </span>
            <span className="flex items-center gap-1">
              {page > 1 ? (
                <Link href={href({ page: page === 2 ? "" : String(page - 1) })} aria-label="Previous page" className="grid h-8 w-8 place-items-center rounded-lg hover:bg-zinc-100">
                  <ChevronLeftIcon className="h-4 w-4" />
                </Link>
              ) : (
                <span className="grid h-8 w-8 place-items-center text-zinc-300"><ChevronLeftIcon className="h-4 w-4" /></span>
              )}
              <span className="px-1">
                {t("Page {page} of {pages}", { page: Math.min(page, pages), pages })}
              </span>
              {page < pages ? (
                <Link href={href({ page: String(page + 1) })} aria-label="Next page" className="grid h-8 w-8 place-items-center rounded-lg hover:bg-zinc-100">
                  <ChevronRightIcon className="h-4 w-4" />
                </Link>
              ) : (
                <span className="grid h-8 w-8 place-items-center text-zinc-300"><ChevronRightIcon className="h-4 w-4" /></span>
              )}
            </span>
          </div>
        )}
      </div>
    </>
  );
}
