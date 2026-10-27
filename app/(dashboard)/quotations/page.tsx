import Link from "next/link";
import { ArrowRightIcon, PlusIcon } from "lucide-react";
import { prisma } from "@/app/lib/prisma";
import { getSettings } from "@/app/lib/settings";
import { formatDate, formatDateTime, formatMoney, toNum } from "@/app/lib/format";
import { PageHeader } from "@/app/components/page-header";
import { ListSearch } from "@/app/components/list-search";

export const metadata = { title: "Quotations" };

const STATUS_STYLES: Record<string, string> = {
  OPEN: "bg-sky-50 text-sky-700",
  CONVERTED: "bg-emerald-50 text-emerald-700",
  CANCELLED: "bg-zinc-100 text-zinc-500",
  EXPIRED: "bg-amber-50 text-amber-700",
};

const FILTERS = [
  { value: "", label: "All" },
  { value: "OPEN", label: "Open" },
  { value: "CONVERTED", label: "Converted" },
  { value: "CANCELLED", label: "Cancelled" },
] as const;

export default async function QuotationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const [settings, params] = await Promise.all([getSettings(), searchParams]);
  const status = FILTERS.some((f) => f.value === params.status && f.value !== "")
    ? (params.status as "OPEN" | "CONVERTED" | "CANCELLED")
    : null;

  const q = params.q?.trim() ?? "";

  const quotes = await prisma.quotation.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(q
        ? {
            OR: [
              { quoteNo: { contains: q, mode: "insensitive" } },
              { customerName: { contains: q, mode: "insensitive" } },
              { note: { contains: q, mode: "insensitive" } },
              { customer: { name: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      customer: { select: { name: true } },
      user: { select: { name: true } },
      _count: { select: { items: true } },
    },
  });
  const now = new Date();

  return (
    <>
      <PageHeader
        title="Quotations"
        description="Estimates for customers and contractors — no stock or money moves until converted"
        actions={
          <Link
            href="/pos"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-4 text-sm font-medium text-white transition hover:bg-brand-800"
          >
            <PlusIcon className="h-4 w-4" />
            New quotation
          </Link>
        }
      />

      <p className="mb-4 text-sm text-zinc-500">
        Build the cart at the POS, then press <strong>Save as quotation</strong>.
      </p>

      <ListSearch
        action="/quotations"
        defaultValue={q}
        placeholder="Search by quotation no, customer or note…"
        keep={{ status: status ?? undefined }}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={`/quotations?${new URLSearchParams({
              ...(f.value ? { status: f.value } : {}),
              ...(q ? { q } : {}),
            }).toString()}`}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              (status ?? "") === f.value
                ? "border-brand-700 bg-brand-700 text-white"
                : "border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="w-full min-w-[640px] text-left lg:min-w-0 text-sm">
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
                  No quotations yet.
                </td>
              </tr>
            )}
            {quotes.map((quote) => {
              const expired =
                quote.status === "OPEN" &&
                quote.validUntil !== null &&
                quote.validUntil < now;
              const shown = expired ? "EXPIRED" : quote.status;
              return (
                <tr key={quote.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/quotations/${quote.id}`}
                      className="font-medium text-zinc-900 hover:underline"
                    >
                      {quote.quoteNo}
                    </Link>
                    <p className="text-xs text-zinc-400">
                      {formatDateTime(quote.createdAt)} · {quote._count.items} item
                      {quote._count.items === 1 ? "" : "s"} · {quote.user.name}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-zinc-600">
                    {quote.customer?.name ?? quote.customerName ?? "Walk-in"}
                  </td>
                  <td className="px-4 py-3 text-zinc-600">
                    {quote.validUntil ? formatDate(quote.validUntil) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[shown]}`}
                    >
                      {shown.charAt(0) + shown.slice(1).toLowerCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-zinc-900">
                    {formatMoney(toNum(quote.total), settings.currency)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/quotations/${quote.id}`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"
                      title="View quotation"
                    >
                      <ArrowRightIcon className="h-4 w-4" />
                    </Link>
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
