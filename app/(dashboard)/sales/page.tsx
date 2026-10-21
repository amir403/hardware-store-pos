import Link from "next/link";
import { ArrowRightIcon, DownloadIcon } from "lucide-react";
import { prisma } from "@/app/lib/prisma";
import { getSettings } from "@/app/lib/settings";
import { formatMoney, formatDateTime, toNum } from "@/app/lib/format";
import { PageHeader } from "@/app/components/page-header";

export const metadata = { title: "Sales" };

const PAYMENT_LABELS: Record<string, string> = {
  CASH: "Cash",
  CARD: "Card",
  BANK_TRANSFER: "Bank transfer",
  MOBILE: "Mobile",
  OTHER: "Other",
};

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

function exportHref(q: string, status: string): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (status) params.set("status", status);
  const query = params.toString();
  return `/api/export/sales${query ? `?${query}` : ""}`;
}

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const [settings, params] = await Promise.all([getSettings(), searchParams]);

  const q = params.q?.trim() ?? "";
  // Ignore anything that is not a real status so the query stays parameterised.
  const status: "" | SaleStatusValue = STATUSES.includes(
    params.status as SaleStatusValue
  )
    ? (params.status as SaleStatusValue)
    : "";

  const sales = await prisma.sale.findMany({
    where: {
      ...(q
        ? {
            OR: [
              { invoiceNo: { contains: q, mode: "insensitive" } },
              { customer: { name: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
      ...(status ? { status } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      user: { select: { name: true } },
      customer: { select: { name: true } },
      _count: { select: { items: true } },
    },
  });

  return (
    <>
      <PageHeader
        title="Sales"
        description={`${sales.length} recent transaction${sales.length === 1 ? "" : "s"}`}
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1">
          {TABS.map((tab) => {
            const active = tab.value === status;
            return (
              <Link
                key={tab.value || "all"}
                href={{
                  pathname: "/sales",
                  query: {
                    ...(q ? { q } : {}),
                    ...(tab.value ? { status: tab.value } : {}),
                  },
                }}
                className={`inline-flex h-8 items-center rounded-lg px-3 text-sm font-medium transition ${
                  active
                    ? "bg-zinc-900 text-white"
                    : "border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <form action="/sales">
            {status && <input type="hidden" name="status" value={status} />}
            <div className="relative max-w-md">
              <input
                type="search"
                name="q"
                defaultValue={q}
                placeholder="Search by invoice no or customer…"
                className="h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 sm:w-80"
              />
            </div>
          </form>

          {/* Plain anchor, not Link: a download must be a real navigation. */}
          <a
            href={exportHref(q, status)}
            download
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
            title="Download the current list as CSV"
          >
            <DownloadIcon className="h-4 w-4" />
            CSV
          </a>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="w-full min-w-[640px] text-left lg:min-w-0 text-sm">
          <thead>
            <tr className="border-b border-zinc-100 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <th className="px-4 py-3 font-medium">Invoice</th>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Cashier</th>
              <th className="px-4 py-3 font-medium">Customer</th>
              <th className="px-4 py-3 font-medium">Payment</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Total</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {sales.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-10 text-center text-sm text-zinc-400"
                >
                  No sales found.
                </td>
              </tr>
            )}
            {sales.map((sale) => (
              <tr key={sale.id} className="hover:bg-zinc-50">
                <td className="px-4 py-3 font-medium text-zinc-900">
                  {sale.invoiceNo}
                </td>
                <td className="px-4 py-3 text-zinc-600">
                  {formatDateTime(sale.createdAt)}
                </td>
                <td className="px-4 py-3 text-zinc-600">
                  {sale.user.name ?? "—"}
                </td>
                <td className="px-4 py-3 text-zinc-600">
                  {sale.customer?.name ?? "Walk-in"}
                </td>
                <td className="px-4 py-3 text-zinc-600">
                  {PAYMENT_LABELS[sale.paymentMethod] ?? sale.paymentMethod}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      STATUS_STYLES[sale.status] ?? "bg-zinc-100 text-zinc-600"
                    }`}
                  >
                    {STATUS_LABELS[sale.status] ?? sale.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-semibold text-zinc-900">
                  {formatMoney(toNum(sale.total), settings.currency)}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/sales/${sale.id}`}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"
                    title="View receipt"
                  >
                    <ArrowRightIcon className="h-4 w-4" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
