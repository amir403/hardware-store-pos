import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeftIcon, ChevronRightIcon, ClipboardListIcon, SlidersHorizontalIcon } from "lucide-react";
import type { Prisma, StockMovementType } from "@/app/generated/prisma/client";
import { prisma } from "@/app/lib/prisma";
import { getCurrentUser, hasRole } from "@/app/lib/auth";
import { getSettings } from "@/app/lib/settings";
import { formatDateTime, formatMoney, formatQty, isoDay, round2, toNum } from "@/app/lib/format";
import { getReorderPlan, groupBySupplier } from "@/app/lib/reorder";
import { PageHeader } from "@/app/components/page-header";
import { SubmitButton } from "@/app/components/submit-button";
import { adjustStockAction } from "@/app/actions/inventory";
import { ConfirmForm } from "@/app/components/confirm-form";
import { Drawer } from "@/app/components/drawer";
import { MOVEMENT_TYPES } from "@/app/lib/stock-movements";

export const metadata = { title: "Inventory" };

const PAGE_SIZE = 50;

const isType = (value: string | undefined): value is StockMovementType =>
  value !== undefined && value in MOVEMENT_TYPES;

/** A yyyy-mm-dd string as local midnight, or null when it is not a real date. */
function parseDay(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.getMonth() === m - 1 ? date : null;
}

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; from?: string; to?: string; page?: string; adjust?: string }>;
}) {
  const user = await getCurrentUser();
  if (!hasRole(user, "ADMIN", "MANAGER")) {
    redirect("/");
  }

  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const type = isType(params.type) ? params.type : undefined;
  const from = parseDay(params.from);
  const toDay = parseDay(params.to);
  const to = toDay ? new Date(toDay.getFullYear(), toDay.getMonth(), toDay.getDate() + 1) : null;
  const page = Math.max(1, Math.floor(Number(params.page)) || 1);

  // Every link keeps the current filters; changing a filter goes back to page 1.
  const href = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const base = { q, type, from: params.from, to: params.to, page: page > 1 ? String(page) : undefined };
    for (const [key, value] of Object.entries({ ...base, ...changes })) {
      if (value) next.set(key, value);
    }
    const query = next.toString();
    return query ? `/inventory?${query}` : "/inventory";
  };
  const listHref = href({});

  const where: Prisma.StockMovementWhereInput = {
    ...(q ? { product: { name: { contains: q, mode: "insensitive" } } } : {}),
    ...(type ? { type } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } } : {}),
  };

  // The plan is the single definition of "low" here, so the list and the
  // reorder drafts under it can never disagree.
  const [settings, plan, movements, total, products] = await Promise.all([
    getSettings(),
    getReorderPlan(),
    prisma.stockMovement.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        product: { select: { id: true, name: true, unit: true } },
        user: { select: { name: true } },
        sale: { select: { id: true } },
        purchase: { select: { id: true } },
      },
    }),
    prisma.stockMovement.count({ where }),
    prisma.product.findMany({
      where: { isActive: true, trackStock: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, stockQty: true, unit: true, costPrice: true },
    }),
  ]);

  const groups = groupBySupplier(plan);
  const stockValue = round2(
    products.reduce((sum, p) => sum + Math.max(0, toNum(p.stockQty)) * toNum(p.costPrice ?? 0), 0)
  );
  const unknownCost = products.filter((p) => p.costPrice === null && toNum(p.stockQty) > 0).length;
  const outOfStock = products.filter((p) => toNum(p.stockQty) <= 0).length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = Boolean(q || type || from || to);

  const chip = (value: StockMovementType | undefined, label: string) => (
    <Link
      key={value ?? "all"}
      href={href({ type: value, page: undefined })}
      className={`rounded-md px-2.5 py-1 text-sm transition ${
        type === value ? "bg-brand-700 font-medium text-white" : "text-zinc-600 hover:bg-zinc-100"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <>
      <PageHeader
        title="Inventory"
        description="Stock on hand, what to reorder, and every stock movement"
        actions={
          <>
            <Link
              href="/inventory/count"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
            >
              <ClipboardListIcon className="h-4 w-4" /> Stock count
            </Link>
            <Link
              href={href({ adjust: "1" })}
              scroll={false}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-4 text-sm font-medium text-white transition hover:bg-brand-800"
            >
              <SlidersHorizontalIcon className="h-4 w-4" /> Adjust stock
            </Link>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="col-span-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 sm:col-span-1">
          <p className="text-xs font-medium text-zinc-500">Stock value at cost</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-zinc-900">{formatMoney(stockValue, settings.currency)}</p>
          <p className="text-xs text-zinc-400">
            {products.length} tracked items
            {unknownCost > 0 ? ` · ${unknownCost} without a cost price` : ""}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
          <p className="text-xs font-medium text-zinc-500">Below reorder level</p>
          <p className={`mt-1 text-lg font-semibold tabular-nums ${plan.length ? "text-amber-700" : "text-zinc-900"}`}>{plan.length}</p>
          <p className="text-xs text-zinc-400">{plan.length ? "See the reorder list below" : "Nothing to reorder"}</p>
        </div>
        <Link
          href={`/products?stock=out`}
          className="rounded-xl border border-zinc-200 bg-white px-4 py-3 transition hover:border-zinc-300"
        >
          <p className="text-xs font-medium text-zinc-500">Out of stock</p>
          <p className={`mt-1 text-lg font-semibold tabular-nums ${outOfStock ? "text-red-700" : "text-zinc-900"}`}>{outOfStock}</p>
          <p className="text-xs text-zinc-400">Open in Products</p>
        </Link>
      </div>

      {plan.length > 0 && (
        <section className="mb-6 overflow-hidden rounded-xl border border-amber-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-100 bg-amber-50/60 px-4 py-3">
            <h2 className="text-sm font-semibold text-zinc-900">Reorder list ({plan.length})</h2>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-zinc-500">Draft a purchase order:</span>
              <Link
                href="/purchases/new?from=lowstock&supplier=all"
                className="inline-flex h-8 items-center rounded-lg bg-brand-700 px-3 text-xs font-medium text-white transition hover:bg-brand-800"
              >
                All {plan.length} items
              </Link>
              {groups.map((group) => (
                <Link
                  key={group.supplierId ?? "none"}
                  href={`/purchases/new?from=lowstock&supplier=${group.supplierId ?? ""}`}
                  title={`${group.lines.length} item(s) · about ${formatMoney(group.value, settings.currency)} at last cost`}
                  className="inline-flex h-8 max-w-full items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100"
                >
                  <span className="truncate">{group.supplierName}</span>
                  <span className="text-zinc-400">{group.lines.length}</span>
                </Link>
              ))}
            </div>
          </div>
          <ul className="grid divide-y divide-zinc-100 sm:grid-cols-2 sm:divide-y-0 xl:grid-cols-3">
            {plan.map((line) => (
              <li key={line.productId} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm sm:border-b sm:border-zinc-100">
                <Link href={`/products/${line.productId}`} className="min-w-0 truncate font-medium text-zinc-900 hover:underline">
                  {line.name}
                </Link>
                <span className="flex shrink-0 items-baseline gap-2">
                  <span className={`font-semibold tabular-nums ${line.stock <= 0 ? "text-red-600" : "text-amber-600"}`}>
                    {formatQty(line.stock)} {line.unit}
                  </span>
                  <span className="text-xs text-zinc-400">order {formatQty(line.suggestedQty)}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="px-4 py-2 text-[11px] text-zinc-400">
            Quantities top each item up to twice its reorder level; the draft stays editable before it is saved.
          </p>
        </section>
      )}

      <section className="rounded-xl border border-zinc-200 bg-white">
        <div className="flex flex-wrap items-center gap-3 border-b border-zinc-100 px-4 py-3">
          <h2 className="mr-auto text-sm font-semibold text-zinc-900">Stock movements</h2>
          <form action="/inventory" className="flex flex-wrap items-center gap-2">
            {type && <input type="hidden" name="type" value={type} />}
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Product…"
              aria-label="Filter by product"
              className="h-9 w-44 rounded-lg border border-zinc-300 bg-white px-3 text-sm outline-none placeholder:text-zinc-400 focus:border-brand-600"
            />
            <input
              type="date"
              name="from"
              defaultValue={params.from && from ? params.from : ""}
              max={isoDay(new Date())}
              aria-label="From date"
              className="h-9 rounded-lg border border-zinc-300 bg-white px-2 text-sm outline-none focus:border-brand-600"
            />
            <span className="text-zinc-400">–</span>
            <input
              type="date"
              name="to"
              defaultValue={params.to && toDay ? params.to : ""}
              max={isoDay(new Date())}
              aria-label="To date"
              className="h-9 rounded-lg border border-zinc-300 bg-white px-2 text-sm outline-none focus:border-brand-600"
            />
            <button
              type="submit"
              className="h-9 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Apply
            </button>
            {filtered && (
              <Link href="/inventory" className="text-sm text-zinc-500 hover:text-zinc-900">
                Clear
              </Link>
            )}
          </form>
        </div>
        <div className="flex flex-wrap gap-1 border-b border-zinc-100 px-3 py-2">
          {chip(undefined, "All")}
          {(Object.keys(MOVEMENT_TYPES) as StockMovementType[]).map((key) => chip(key, MOVEMENT_TYPES[key].label))}
        </div>

        <div className="overflow-x-auto">
          {/* On a phone: product (date under it), type and change; reason and user are on the bill. */}
          <table className="w-full text-left text-sm sm:min-w-[760px]">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Date</th>
                <th className="px-3 py-2.5 font-medium sm:px-4">Product</th>
                <th className="px-2 py-2.5 font-medium sm:px-4">Type</th>
                <th className="px-3 py-2.5 text-right font-medium sm:px-4">Change</th>
                <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Reason</th>
                <th className="hidden px-4 py-2.5 font-medium sm:table-cell">By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {movements.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-zinc-400">
                    {filtered ? "No stock movements match these filters." : "No stock movements yet."}
                  </td>
                </tr>
              )}
              {movements.map((m) => {
                const change = toNum(m.quantityChange);
                const source = m.sale ? `/sales/${m.sale.id}` : m.purchase ? `/purchases/${m.purchase.id}` : null;
                return (
                  <tr key={m.id} className="hover:bg-zinc-50">
                    <td className="hidden whitespace-nowrap px-4 py-2.5 text-zinc-500 sm:table-cell">{formatDateTime(m.createdAt)}</td>
                    <td className="px-3 py-2.5 sm:px-4">
                      <Link href={`/products/${m.product.id}`} className="font-medium text-zinc-900 hover:underline">
                        {m.product.name}
                      </Link>
                      <p className="text-xs text-zinc-400 sm:hidden">{formatDateTime(m.createdAt)}</p>
                    </td>
                    <td className="px-2 py-2.5 sm:px-4">
                      <span
                        className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${
                          MOVEMENT_TYPES[m.type]?.style ?? "bg-zinc-100 text-zinc-600"
                        }`}
                      >
                        {MOVEMENT_TYPES[m.type]?.label ?? m.type}
                      </span>
                    </td>
                    <td
                      className={`whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums sm:px-4 ${
                        change > 0 ? "text-emerald-600" : "text-red-600"
                      }`}
                    >
                      {change > 0 ? "+" : ""}
                      {formatQty(change)} <span className="text-xs font-normal text-zinc-400">{m.product.unit}</span>
                    </td>
                    <td className="hidden max-w-72 truncate px-4 py-2.5 text-zinc-500 sm:table-cell">
                      {source ? (
                        <Link href={source} className="hover:text-zinc-900 hover:underline">
                          {m.reason ?? "Open"}
                        </Link>
                      ) : (
                        (m.reason ?? "—")
                      )}
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-2.5 text-zinc-500 sm:table-cell">{m.user?.name ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {total > 0 && (
          <div className="flex items-center justify-between border-t border-zinc-100 px-4 py-2.5 text-sm text-zinc-500">
            <span>
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
            </span>
            <span className="flex items-center gap-1">
              {page > 1 ? (
                <Link href={href({ page: page === 2 ? undefined : String(page - 1) })} aria-label="Previous page" className="grid h-8 w-8 place-items-center rounded-lg hover:bg-zinc-100">
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
      </section>

      {params.adjust && (
        <Drawer title="Adjust stock" closeHref={listHref}>
          <p className="mb-4 text-sm text-zinc-500">
            Set the counted quantity. The difference is recorded as an adjustment, with your name and the reason.
          </p>
          <ConfirmForm action={adjustStockAction} successMessage="Stock adjusted" doneHref={listHref} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5 text-sm font-medium text-zinc-700">
              Product
              <select
                name="productId"
                required
                defaultValue={products.some((p) => p.id === params.adjust) ? params.adjust : ""}
                className="h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-normal text-zinc-900 outline-none focus:border-brand-600"
              >
                <option value="" disabled>
                  Select product…
                </option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({formatQty(toNum(p.stockQty))} {p.unit})
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-zinc-700">
              Counted quantity
              <input
                type="number"
                name="newQty"
                min="0"
                step="any"
                required
                placeholder="What is on the shelf now"
                className="h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-normal text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-brand-600"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-zinc-700">
              Reason
              <input
                type="text"
                name="reason"
                maxLength={200}
                placeholder="e.g. broken in store, found in godown"
                className="h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-normal text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-brand-600"
              />
            </label>
            <SubmitButton>Apply adjustment</SubmitButton>
          </ConfirmForm>
        </Drawer>
      )}
    </>
  );
}
