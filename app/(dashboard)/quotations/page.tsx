import Link from "next/link";
import { PlusIcon } from "lucide-react";
import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/app/lib/prisma";
import { getSettings } from "@/app/lib/settings";
import { formatDate, formatDateTime, formatMoney, round2, toNum } from "@/app/lib/format";
import { PageHeader } from "@/app/components/page-header";
import { ListSearch } from "@/app/components/list-search";
import { ConvertQuotationButton } from "@/app/components/quotations/convert-button";

export const metadata = { title: "Quotations" };

const STATUS_STYLES: Record<string, string> = {
  OPEN: "bg-sky-50 text-sky-700",
  CONVERTED: "bg-emerald-50 text-emerald-700",
  CANCELLED: "bg-zinc-100 text-zinc-500",
  EXPIRED: "bg-amber-50 text-amber-700",
};

// "Expired" is not stored: it is an open quotation whose validity date has passed.
const FILTERS = [
  { value: "", label: "All" },
  { value: "OPEN", label: "Open" },
  { value: "EXPIRED", label: "Expired" },
  { value: "CONVERTED", label: "Converted" },
  { value: "CANCELLED", label: "Cancelled" },
] as const;
type Filter = (typeof FILTERS)[number]["value"];

const DAY = 24 * 60 * 60 * 1000;

export default async function QuotationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const [settings, params] = await Promise.all([getSettings(), searchParams]);
  const currency = settings.currency;
  const filter: Filter = FILTERS.some((f) => f.value === params.status) ? (params.status as Filter) : "";
  const q = params.q?.trim() ?? "";
  const now = new Date();

  const search: Prisma.QuotationWhereInput = q
    ? {
        OR: [
          { quoteNo: { contains: q, mode: "insensitive" } },
          { customerName: { contains: q, mode: "insensitive" } },
          { note: { contains: q, mode: "insensitive" } },
          { customer: { name: { contains: q, mode: "insensitive" } } },
        ],
      }
    : {};
  const live: Prisma.QuotationWhereInput = { OR: [{ validUntil: null }, { validUntil: { gte: now } }] };
  const byFilter: Record<Filter, Prisma.QuotationWhereInput> = {
    "": {},
    OPEN: { status: "OPEN", ...live },
    EXPIRED: { status: "OPEN", validUntil: { lt: now } },
    CONVERTED: { status: "CONVERTED" },
    CANCELLED: { status: "CANCELLED" },
  };

  const [quotes, counts, openLive] = await Promise.all([
    prisma.quotation.findMany({
      where: { AND: [search, byFilter[filter]] },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        customer: { select: { name: true } },
        user: { select: { name: true } },
        sale: { select: { id: true, invoiceNo: true } },
        _count: { select: { items: true } },
      },
    }),
    Promise.all(FILTERS.map((f) => prisma.quotation.count({ where: { AND: [search, byFilter[f.value]] } }))),
    prisma.quotation.findMany({
      where: { AND: [search, byFilter.OPEN] },
      select: { total: true, validUntil: true },
    }),
  ]);

  const openValue = round2(openLive.reduce((sum, quote) => sum + toNum(quote.total), 0));
  const soon = openLive.filter((quote) => quote.validUntil && quote.validUntil.getTime() - now.getTime() < 3 * DAY);
  const countOf = (value: Filter) => counts[FILTERS.findIndex((f) => f.value === value)];
  const decided = countOf("CONVERTED") + countOf("CANCELLED") + countOf("EXPIRED");

  const href = (status: Filter) => {
    const next = new URLSearchParams({ ...(status ? { status } : {}), ...(q ? { q } : {}) }).toString();
    return next ? `/quotations?${next}` : "/quotations";
  };

  const stats = [
    {
      label: "Open quotations",
      value: formatMoney(openValue, currency),
      tone: "text-zinc-900",
      sub: `${openLive.length} waiting for the customer`,
      link: href("OPEN"),
    },
    {
      label: "Expiring within 3 days",
      value: String(soon.length),
      tone: soon.length > 0 ? "text-amber-700" : "text-zinc-900",
      sub: soon.length > 0 ? "Follow up before they lapse" : "None about to lapse",
      link: href("OPEN"),
    },
    {
      label: "Converted to sales",
      value: decided > 0 ? `${Math.round((countOf("CONVERTED") / decided) * 100)}%` : "—",
      tone: "text-emerald-700",
      sub: `${countOf("CONVERTED")} of ${decided} decided quotation${decided === 1 ? "" : "s"}`,
      link: href("CONVERTED"),
    },
  ];

  return (
    <>
      <PageHeader
        title="Quotations"
        description="Estimates for customers and contractors. No stock or money moves until one is converted."
        actions={
          <Link
            href="/pos"
            title="Build the cart at New Sale, then press Save as quotation"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-4 text-sm font-medium text-white transition hover:bg-brand-800"
          >
            <PlusIcon className="h-4 w-4" />
            New quotation
          </Link>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {stats.map((stat) => (
          <Link
            key={stat.label}
            href={stat.link}
            className="rounded-xl border border-zinc-200 bg-white px-4 py-3 transition hover:border-zinc-300"
          >
            <p className="text-xs font-medium text-zinc-500">{stat.label}</p>
            <p className={`mt-1 text-lg font-semibold tabular-nums ${stat.tone}`}>{stat.value}</p>
            <p className="text-xs text-zinc-400">{stat.sub}</p>
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap items-start gap-x-3">
        <div className="mb-4 flex h-10 max-w-full items-center gap-1 overflow-x-auto rounded-lg border border-zinc-200 bg-white p-1">
          {FILTERS.map((f) => (
            <Link
              key={f.value || "all"}
              href={href(f.value)}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1 text-sm transition ${
                filter === f.value ? "bg-brand-700 font-medium text-white" : "text-zinc-600 hover:bg-zinc-100"
              }`}
            >
              {f.label}
              <span className={`text-xs tabular-nums ${filter === f.value ? "text-white/75" : "text-zinc-400"}`}>
                {countOf(f.value)}
              </span>
            </Link>
          ))}
        </div>
        <div className="min-w-64 flex-1">
          <ListSearch
            action="/quotations"
            defaultValue={q}
            placeholder="Search by quotation no, customer or note…"
            keep={{ status: filter || undefined }}
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-100 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <th className="px-4 py-3 font-medium">Quotation</th>
              <th className="px-4 py-3 font-medium">For</th>
              <th className="px-4 py-3 font-medium">Valid until</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Total</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {quotes.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-zinc-400">
                  {filter || q ? "No quotations in this view." : "No quotations yet. Build a cart at New Sale and press Save as quotation."}
                </td>
              </tr>
            )}
            {quotes.map((quote) => {
              const expired = quote.status === "OPEN" && quote.validUntil !== null && quote.validUntil < now;
              const shown = expired ? "EXPIRED" : quote.status;
              const daysLeft =
                quote.status === "OPEN" && quote.validUntil && !expired
                  ? Math.ceil((quote.validUntil.getTime() - now.getTime()) / DAY)
                  : null;
              return (
                <tr key={quote.id} className="relative hover:bg-zinc-50">
                  <td className="px-4 py-3">
                    {/* Stretched over the row: a click anywhere opens the quotation. */}
                    <Link
                      href={`/quotations/${quote.id}`}
                      className="whitespace-nowrap font-medium text-zinc-900 after:absolute after:inset-0 after:content-['']"
                    >
                      {quote.quoteNo}
                    </Link>
                    <p className="text-xs text-zinc-400">
                      {formatDateTime(quote.createdAt)} · {quote._count.items} item
                      {quote._count.items === 1 ? "" : "s"} · {quote.user.name}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-zinc-700">
                    {quote.customer?.name ?? quote.customerName ?? <span className="text-zinc-400">Walk-in</span>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-zinc-600">
                    {quote.validUntil ? formatDate(quote.validUntil) : "—"}
                    {daysLeft !== null && (
                      <span className={`block text-xs ${daysLeft <= 3 ? "text-amber-700" : "text-zinc-400"}`}>
                        {daysLeft <= 1 ? "last day" : `${daysLeft} days left`}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[shown]}`}>
                      {shown.charAt(0) + shown.slice(1).toLowerCase()}
                    </span>
                    {quote.sale && (
                      <Link
                        href={`/sales/${quote.sale.id}`}
                        className="relative z-10 mt-0.5 block text-xs text-brand-700 hover:underline"
                      >
                        {quote.sale.invoiceNo}
                      </Link>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-zinc-900">
                    {formatMoney(toNum(quote.total), currency)}
                  </td>
                  <td className="px-4 py-3">
                    {quote.status === "OPEN" && (
                      <div className="relative z-10 flex justify-end">
                        <ConvertQuotationButton quotationId={quote.id} />
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
