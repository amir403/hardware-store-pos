import Link from "next/link";
import { redirect } from "next/navigation";
import { PrinterIcon, SearchIcon } from "lucide-react";
import { prisma } from "@/app/lib/prisma";
import { getCurrentUser, hasRole } from "@/app/lib/auth";
import { getSettings } from "@/app/lib/settings";
import { formatMoney, toNum } from "@/app/lib/format";
import { PageHeader } from "@/app/components/page-header";
import { LABEL_SIZES } from "@/app/lib/print-formats";

export const metadata = { title: "Barcode labels" };

/** Keeps the printed sheet's URL short enough to survive a browser GET. */
const LIST_LIMIT = 120;

export default async function BarcodeLabelsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  const user = await getCurrentUser();
  if (!hasRole(user, "ADMIN", "MANAGER")) redirect("/");

  const [settings, params] = await Promise.all([getSettings(), searchParams]);

  const q = params.q?.trim() ?? "";
  const categoryId = params.category?.trim() ?? "";

  const [categories, products] = await Promise.all([
    prisma.category.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.product.findMany({
      where: {
        AND: [
          { isActive: true },
          q
            ? {
                OR: [
                  { name: { contains: q, mode: "insensitive" } },
                  { sku: { contains: q, mode: "insensitive" } },
                  { barcode: { contains: q, mode: "insensitive" } },
                ],
              }
            : {},
          categoryId ? { categoryId } : {},
        ],
      },
      include: { category: { select: { name: true } } },
      orderBy: { name: "asc" },
      take: LIST_LIMIT,
    }),
  ]);

  const scannable = products.filter((p) => p.barcode || p.sku);

  return (
    <>
      <PageHeader
        title="Barcode labels"
        description="Tick the items you want to tag, then print the sheet"
      />

      <form className="mb-4 flex flex-wrap gap-2" action="/labels">
        <div className="relative min-w-52 flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search by name, SKU or barcode…"
            className="h-10 w-full rounded-lg border border-zinc-300 bg-white pl-9 pr-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
          />
        </div>
        <select
          name="category"
          defaultValue={categoryId}
          className="h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-zinc-900"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="h-10 rounded-lg border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
        >
          Filter
        </button>
      </form>

      {products.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-12 text-center text-sm text-zinc-400">
          No products match this search.
        </div>
      ) : (
        <form method="get" action="/labels/print" className="space-y-4">
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 bg-zinc-50 px-4 py-3">
              <p className="text-sm text-zinc-600">
                Tick each item · shift-click to select a range
              </p>
              <label className="flex items-center gap-2 text-sm text-zinc-700">
                Label size
                <select
                  name="size"
                  defaultValue={settings.labelSize}
                  className="h-8 rounded-lg border border-zinc-300 bg-white px-2 text-sm text-zinc-900 outline-none focus:border-zinc-900"
                >
                  {Object.entries(LABEL_SIZES).map(([value, size]) => (
                    <option key={value} value={value}>
                      {size.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm text-zinc-700">
                Labels per product
                <input
                  type="number"
                  name="per"
                  min={1}
                  max={24}
                  defaultValue={2}
                  className="h-8 w-16 rounded-lg border border-zinc-300 bg-white px-2 text-center text-sm text-zinc-900 outline-none focus:border-zinc-900"
                />
              </label>
            </div>

            <ul className="divide-y divide-zinc-100">
              {products.map((product) => {
                const code = product.barcode ?? product.sku;
                return (
                  <li key={product.id} className="flex items-center gap-3 px-4 py-2.5">
                    {code ? (
                      <input
                        type="checkbox"
                        name="ids"
                        value={product.id}
                        className="h-4 w-4 shrink-0 rounded border-zinc-300"
                      />
                    ) : (
                      <span className="h-4 w-4 shrink-0" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-zinc-900">
                        {product.name}
                      </span>
                      <span className="block truncate text-xs text-zinc-400">
                        {product.category?.name ?? "Uncategorised"}
                        {code
                          ? ` · ${product.barcode ? "barcode" : "SKU"} ${code}`
                          : " · no barcode or SKU"}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-medium text-zinc-900">
                      {formatMoney(toNum(product.price), settings.currency)}
                    </span>
                    {!code && (
                      <Link
                        href={`/products/${product.id}`}
                        className="shrink-0 text-xs font-medium text-amber-700 hover:underline"
                      >
                        add code
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={scannable.length === 0}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <PrinterIcon className="h-4 w-4" />
              Print labels
            </button>
            <p className="text-xs text-zinc-500">
              Labels encode the product barcode, or its SKU when no barcode is
              set — the till matches on either. Items without both are skipped.
            </p>
          </div>
        </form>
      )}

      {products.length === LIST_LIMIT && (
        <p className="mt-4 text-xs text-amber-700">
          Showing the first {LIST_LIMIT} matches — narrow the search to print a
          specific batch.
        </p>
      )}
    </>
  );
}
