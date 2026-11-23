import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from "lucide-react";
import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/app/lib/prisma";
import { getCurrentUser, hasRole } from "@/app/lib/auth";
import { getSettings } from "@/app/lib/settings";
import { formatDate, formatDateTime, formatMoney, isoDay, round2 } from "@/app/lib/format";
import { PageHeader } from "@/app/components/page-header";
import { purchaseSettlement } from "@/app/lib/payables";

export const metadata = { title: "Purchases" };

const PAGE_SIZE = 50;

const SHOWS = { "": "All", unpaid: "Unpaid", overdue: "Overdue" } as const;
type Show = keyof typeof SHOWS;

/** A yyyy-mm-dd string, or "" when it is not a real date. */
function validDay(value: string | undefined): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d).getMonth() === m - 1 ? value : "";
}

export default async function PurchasesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; supplier?: string; show?: string; from?: string; to?: string; page?: string }>;
}) {
  const user = await getCurrentUser();
  if (!hasRole(user, "ADMIN", "MANAGER")) {
    redirect("/");
  }

  const [settings, params, suppliers] = await Promise.all([
    getSettings(),
    searchParams,
    prisma.supplier.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const currency = settings.currency;
  const q = params.q?.trim() ?? "";
  const supplier = suppliers.some((s) => s.id === params.supplier) ? params.supplier! : "";
  const show: Show = Object.hasOwn(SHOWS, params.show ?? "") ? (params.show as Show) : "";
  const from = validDay(params.from);
  const to = validDay(params.to);
  const page = Math.max(1, Math.floor(Number(params.page)) || 1);

  const filters = { q, supplier, show, from, to };
  // Every link keeps the other filters; changing one goes back to page 1.
  const href = (changes: Partial<Record<keyof typeof filters | "page", string>>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...filters, page: "", ...changes })) {
      if (value) next.set(key, value);
    }
    const query = next.toString();
    return query ? `/purchases?${query}` : "/purchases";
  };

  const today = new Date();
  const daysAgo = (n: number) => isoDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() - n));
  const ranges = [
    { label: "7 days", from: daysAgo(6), to: daysAgo(0) },
    { label: "This month", from: isoDay(new Date(today.getFullYear(), today.getMonth(), 1)), to: daysAgo(0) },
    {
      label: "Last month",
      from: isoDay(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
      to: isoDay(new Date(today.getFullYear(), today.getMonth(), 0)),
    },
    { label: "All time", from: "", to: "" },
  ];

  const where: Prisma.PurchaseWhereInput = {
    ...(q
      ? {
          OR: [
            { referenceNo: { contains: q, mode: "insensitive" } },
            { note: { contains: q, mode: "insensitive" } },
            { supplier: { name: { contains: q, mode: "insensitive" } } },
            { items: { some: { product: { name: { contains: q, mode: "insensitive" } } } } },
          ],
        }
      : {}),
    ...(supplier ? { supplierId: supplier } : {}),
    ...(from || to
      ? {
          createdAt: {
            ...(from ? { gte: new Date(`${from}T00:00:00`) } : {}),
            ...(to ? { lte: new Date(`${to}T23:59:59.999`) } : {}),
          },
        }
      : {}),
  };

  // shortcut: what is still owed depends on payments and returns, so every match is loaded and
  // filtered here. Fine for a single shop's purchase volume; move to SQL if it reaches tens of thousands.
  const matches = await prisma.purchase.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      supplier: { select: { name: true } },
      user: { select: { name: true } },
      _count: { select: { items: true } },
      payments: { select: { amount: true } },
      returns: { select: { amount: true } },
    },
  });

  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const rows = matches.map((purchase) => {
    const settlement = purchaseSettlement(purchase);
    const overdue = settlement.due > 0 && purchase.dueDate !== null && purchase.dueDate < startOfToday;
    return { purchase, ...settlement, overdue };
  });
  const unpaid = rows.filter((r) => r.due > 0);
  const overdue = rows.filter((r) => r.overdue);
  const list = show === "unpaid" ? unpaid : show === "overdue" ? overdue : rows;
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const pageRows = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const sumOf = (items: typeof rows, key: "netTotal" | "due") => round2(items.reduce((s, r) => s + r[key], 0));
  const stats = [
    {
      label: "Purchased",
      value: formatMoney(sumOf(rows, "netTotal"), currency),
      tone: "text-zinc-900",
      sub: `${rows.length} purchase${rows.length === 1 ? "" : "s"}, after returns`,
      link: href({ show: "" }),
      active: show === "",
    },
    {
      label: "Still unpaid",
      value: formatMoney(sumOf(unpaid, "due"), currency),
      tone: unpaid.length > 0 ? "text-amber-700" : "text-zinc-900",
      sub: unpaid.length > 0 ? `${unpaid.length} purchase${unpaid.length === 1 ? "" : "s"} not fully paid` : "Everything is paid",
      link: href({ show: "unpaid" }),
      active: show === "unpaid",
    },
    {
      label: "Overdue",
      value: formatMoney(sumOf(overdue, "due"), currency),
      tone: overdue.length > 0 ? "text-red-700" : "text-zinc-900",
      sub: overdue.length > 0 ? `${overdue.length} past the due date` : "Nothing past its due date",
      link: href({ show: "overdue" }),
      active: show === "overdue",
    },
  ];

  const filtered = q || supplier || from || to;

  return (
    <>
      <PageHeader
        title="Purchases"
        description={filtered ? `${rows.length} purchase${rows.length === 1 ? "" : "s"} in this view` : "Stock intake from suppliers"}
        actions={
          <Link
            href="/purchases/new"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-4 text-sm font-medium text-white transition hover:bg-brand-800"
          >
            <PlusIcon className="h-4 w-4" />
            Record purchase
          </Link>
        }
      />

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
                {range.label}
              </Link>
            );
          })}
        </div>
        <form action="/purchases" className="flex flex-wrap items-center gap-2">
          {Object.entries({ q, show }).map(([name, value]) =>
            value ? <input key={name} type="hidden" name={name} value={value} /> : null
          )}
          <select
            name="supplier"
            defaultValue={supplier}
            aria-label="Supplier"
            className="h-10 max-w-48 rounded-lg border border-zinc-300 bg-white px-2 text-sm outline-none focus:border-brand-600"
          >
            <option value="">All suppliers</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
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
            Apply
          </button>
        </form>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {stats.map((stat) => (
          <Link
            key={stat.label}
            href={stat.link}
            className={`rounded-xl border bg-white px-4 py-3 transition hover:border-zinc-300 ${
              stat.active ? "border-brand-600 ring-1 ring-brand-600/20" : "border-zinc-200"
            }`}
          >
            <p className="text-xs font-medium text-zinc-500">{stat.label}</p>
            <p className={`mt-1 text-lg font-semibold tabular-nums ${stat.tone}`}>{stat.value}</p>
            <p className="text-xs text-zinc-400">{stat.sub}</p>
          </Link>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1">
          {(Object.keys(SHOWS) as Show[]).map((key) => (
            <Link
              key={key || "all"}
              href={href({ show: key })}
              className={`inline-flex h-8 items-center rounded-lg px-3 text-sm font-medium transition ${
                show === key ? "bg-brand-700 text-white" : "border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              {SHOWS[key]}
            </Link>
          ))}
          {filtered && (
            <Link href="/purchases" className="ml-1 text-sm text-brand-700 hover:underline">
              Clear filters
            </Link>
          )}
        </div>
        <form action="/purchases" className="w-full sm:w-80">
          {Object.entries({ supplier, show, from, to }).map(([name, value]) =>
            value ? <input key={name} type="hidden" name={name} value={value} /> : null
          )}
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search by reference, supplier or product…"
            className="h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15"
          />
        </form>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-100 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <th className="px-4 py-3 font-medium">Reference</th>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Supplier</th>
              <th className="px-4 py-3 font-medium">Received by</th>
              <th className="px-4 py-3 text-right font-medium">Total</th>
              <th className="px-4 py-3 text-right font-medium">Unpaid</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-zinc-400">
                  {matches.length === 0 && !filtered ? "No purchases recorded yet." : "No purchases in this view."}
                </td>
              </tr>
            )}
            {pageRows.map(({ purchase, netTotal, returned, due, overdue: isOverdue }) => (
              <tr key={purchase.id} className="relative hover:bg-zinc-50">
                <td className="whitespace-nowrap px-4 py-3">
                  {/* Stretched over the row: a click anywhere opens the purchase. */}
                  <Link
                    href={`/purchases/${purchase.id}`}
                    className="font-medium text-zinc-900 after:absolute after:inset-0 after:content-['']"
                  >
                    {purchase.referenceNo ?? <span className="text-zinc-400">No reference</span>}
                  </Link>
                  <span className="block text-xs text-zinc-400">
                    {purchase._count.items} item{purchase._count.items === 1 ? "" : "s"}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-zinc-600">{formatDateTime(purchase.createdAt)}</td>
                <td className="px-4 py-3 text-zinc-700">{purchase.supplier?.name ?? <span className="text-zinc-400">—</span>}</td>
                <td className="whitespace-nowrap px-4 py-3 text-zinc-600">{purchase.user?.name ?? "—"}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <span className="font-semibold tabular-nums text-zinc-900">{formatMoney(netTotal, currency)}</span>
                  {returned > 0 && (
                    <span className="block text-xs text-zinc-400">{formatMoney(returned, currency)} returned</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  {due > 0 ? (
                    <>
                      <span className={`font-medium tabular-nums ${isOverdue ? "text-red-700" : "text-amber-700"}`}>
                        {formatMoney(due, currency)}
                      </span>
                      {purchase.dueDate && (
                        <span className={`block text-xs ${isOverdue ? "text-red-600" : "text-zinc-400"}`}>
                          {isOverdue ? "was due" : "due"} {formatDate(purchase.dueDate)}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-zinc-400">{due < 0 ? `${formatMoney(-due, currency)} credit` : "Paid"}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {list.length > 0 && (
          <div className="flex items-center justify-between border-t border-zinc-100 px-4 py-2.5 text-sm text-zinc-500">
            <span>
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, list.length)} of {list.length}
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
                Page {Math.min(page, pages)} of {pages}
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
