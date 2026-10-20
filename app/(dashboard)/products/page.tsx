import Link from "next/link";
import { PlusIcon, SearchIcon, PencilIcon } from "lucide-react";
import { prisma } from "@/app/lib/prisma";
import { getCurrentUser, hasRole } from "@/app/lib/auth";
import { getSettings } from "@/app/lib/settings";
import { formatMoney, formatQty, toNum } from "@/app/lib/format";
import { PageHeader } from "@/app/components/page-header";
import { toggleProductActiveAction } from "@/app/actions/products";

export const metadata = { title: "Products" };

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; created?: string; updated?: string }>;
}) {
  const [user, settings, params] = await Promise.all([
    getCurrentUser(),
    getSettings(),
    searchParams,
  ]);

  const canManage = hasRole(user, "ADMIN", "MANAGER");

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
      take: 200,
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Products"
        description={`${products.length} product${products.length === 1 ? "" : "s"} in catalog`}
        actions={
          canManage && (
            <Link
              href="/products/new"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition hover:bg-zinc-700"
            >
              <PlusIcon className="h-4 w-4" />
              Add product
            </Link>
          )
        }
      />

      {(params.created || params.updated) && (
        <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {params.created
            ? "Product created successfully."
            : "Product updated successfully."}
        </p>
      )}

      {/* Filters */}
      <form className="mb-4 flex flex-wrap gap-2" action="/products">
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

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-100 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <th className="px-4 py-3 font-medium">Product</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 text-right font-medium">Price</th>
              <th className="px-4 py-3 text-right font-medium">Stock</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {products.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-10 text-center text-sm text-zinc-400"
                >
                  No products found.
                </td>
              </tr>
            )}
            {products.map((product) => {
              const stock = toNum(product.stockQty);
              const reorder = toNum(product.reorderLevel);
              const low = product.trackStock && reorder > 0 && stock <= reorder;

              return (
                <tr key={product.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-zinc-900">
                      {product.name}
                    </p>
                    <p className="text-xs text-zinc-400">
                      {product.sku ?? "No SKU"}
                      {product.unit !== "pcs" ? ` · per ${product.unit}` : ""}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-zinc-600">
                    {product.category?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-zinc-900">
                    {formatMoney(toNum(product.price), settings.currency)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {product.trackStock ? (
                      <span
                        className={`font-medium ${
                          stock === 0
                            ? "text-red-600"
                            : low
                              ? "text-amber-600"
                              : "text-zinc-900"
                        }`}
                      >
                        {formatQty(stock)} {product.unit}
                      </span>
                    ) : (
                      <span className="text-zinc-400">untracked</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {product.isActive ? (
                      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500">
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {canManage && (
                        <>
                          <Link
                            href={`/products/${product.id}`}
                            title="Edit"
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"
                          >
                            <PencilIcon className="h-4 w-4" />
                          </Link>
                          <form action={toggleProductActiveAction}>
                            <input
                              type="hidden"
                              name="id"
                              value={product.id}
                            />
                            <button
                              type="submit"
                              title={product.isActive ? "Deactivate" : "Activate"}
                              className="rounded-lg px-2 py-1 text-xs font-medium text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"
                            >
                              {product.isActive ? "Deactivate" : "Activate"}
                            </button>
                          </form>
                        </>
                      )}
                    </div>
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
