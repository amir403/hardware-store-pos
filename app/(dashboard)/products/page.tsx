import { variantLabel } from "@/app/lib/variants";
import { Fragment } from "react";
import Link from "next/link";
import {
  PlusIcon,
  SearchIcon,
  PencilIcon,
  LayersIcon,
  TagsIcon,
  ChevronDownIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "lucide-react";
import type { Prisma } from "@/app/generated/prisma/client";
import { CategoryManager } from "@/app/components/category-manager";
import { prisma } from "@/app/lib/prisma";
import { getCurrentUser, hasRole } from "@/app/lib/auth";
import { getSettings } from "@/app/lib/settings";
import { formatMoney, formatQty, toNum } from "@/app/lib/format";
import { PageHeader } from "@/app/components/page-header";
import { toggleProductActiveAction } from "@/app/actions/products";
import { ConfirmForm } from "@/app/components/confirm-form";
import { FlashToast } from "@/app/components/toast";
import { ProductThumb } from "@/app/components/product-thumb";

export const metadata = { title: "Products" };

const PAGE_SIZE = 50;
const SORTS = ["name", "price", "stock"] as const;
type Sort = (typeof SORTS)[number];
const STOCK_FILTERS = [
  { value: "", label: "All stock" },
  { value: "low", label: "Low stock" },
  { value: "out", label: "Out of stock" },
  { value: "inactive", label: "Inactive" },
] as const;

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    category?: string;
    stock?: string;
    sort?: string;
    dir?: string;
    page?: string;
    created?: string;
    updated?: string;
  }>;
}) {
  const [user, settings, params] = await Promise.all([
    getCurrentUser(),
    getSettings(),
    searchParams,
  ]);

  const canManage = hasRole(user, "ADMIN", "MANAGER");

  const q = params.q?.trim() ?? "";
  const categoryId = params.category?.trim() ?? "";
  const stockFilter = STOCK_FILTERS.find((f) => f.value === params.stock)?.value ?? "";
  const sort = SORTS.includes(params.sort as Sort) ? (params.sort as Sort) : "name";
  const dir: "asc" | "desc" = params.dir === "desc" ? "desc" : "asc";
  const page = Math.max(1, Math.floor(Number(params.page)) || 1);

  const where: Prisma.ProductWhereInput = {
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
      stockFilter === "out" ? { trackStock: true, stockQty: { lte: 0 } } : {},
      stockFilter === "low"
        ? {
            trackStock: true,
            stockQty: { gt: 0, lte: prisma.product.fields.reorderLevel },
            reorderLevel: { gt: 0 },
          }
        : {},
      stockFilter === "inactive" ? { isActive: false } : {},
    ],
  };

  const [categories, products, total] = await Promise.all([
    prisma.category.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.product.findMany({
      where,
      include: {
        category: { select: { name: true } },
        group: { select: { name: true, _count: { select: { products: true } } } },
      },
      orderBy:
        sort === "name"
          ? { name: dir }
          : sort === "price"
            ? [{ price: dir }, { name: "asc" }]
            : // Untracked services have no real stock; keep them last.
              [{ trackStock: "desc" }, { stockQty: dir }, { name: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.product.count({ where }),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // Designs only sit next to each other when sorted by name.
  const showGroups = sort === "name";

  /** This page's URL with some params changed; empty values are dropped. */
  const href = (changes: Record<string, string | number | undefined>) => {
    const next = new URLSearchParams();
    const merged = { q, category: categoryId, stock: stockFilter, sort, dir, page, ...changes };
    for (const [key, value] of Object.entries(merged)) {
      const isDefault = (key === "sort" && value === "name") || (key === "dir" && value === "asc") || (key === "page" && value === 1);
      if (value !== undefined && value !== "" && !isDefault) next.set(key, String(value));
    }
    const qs = next.toString();
    return qs ? `/products?${qs}` : "/products";
  };

  const sortHeader = (col: Sort, label: string, alignRight = false) => {
    const active = sort === col;
    const Arrow = active && dir === "desc" ? ArrowDownIcon : ArrowUpIcon;
    return (
      <th className={`px-4 py-3 font-medium ${alignRight ? "text-right" : ""}`} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}>
        <Link
          href={href({ sort: col, dir: active && dir === "asc" ? "desc" : "asc", page: 1 })}
          className={`inline-flex items-center gap-1 transition hover:text-zinc-900 ${active ? "text-zinc-900" : ""}`}
        >
          {label}
          <Arrow className={`h-3 w-3 ${active ? "" : "opacity-0"}`} />
        </Link>
      </th>
    );
  };

  return (
    <>
      <PageHeader
        title="Products"
        description={`${total} product${total === 1 ? "" : "s"}${q || categoryId || stockFilter ? " found" : " in catalog"}`}
        actions={
          canManage && (
            <div className="flex items-center gap-2">
              <Link
                href="/products/import"
                className="inline-flex h-9 items-center rounded-lg border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
              >
                Import
              </Link>
              <Link
                href="/products/new"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-4 text-sm font-medium text-white transition hover:bg-brand-800"
              >
                <PlusIcon className="h-4 w-4" />
                Add product
              </Link>
            </div>
          )
        }
      />

      {(params.created || params.updated) && (
        <FlashToast
          message={params.created ? "Product created" : "Product updated"}
          clearParams={["created", "updated"]}
        />
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
            className="h-10 w-full rounded-lg border border-zinc-300 bg-white pl-9 pr-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15"
          />
        </div>
        <select
          name="category"
          defaultValue={categoryId}
          className="h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-brand-600"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          name="stock"
          defaultValue={stockFilter}
          className="h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-brand-600"
        >
          {STOCK_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        {sort !== "name" && <input type="hidden" name="sort" value={sort} />}
        {dir !== "asc" && <input type="hidden" name="dir" value={dir} />}
        <button
          type="submit"
          className="h-10 rounded-lg border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
        >
          Filter
        </button>
      </form>

      {canManage && (
        <details className="group/cat mb-4 rounded-xl border border-zinc-200 bg-white">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-zinc-700 hover:text-zinc-900 [&::-webkit-details-marker]:hidden">
            <TagsIcon className="h-4 w-4 text-brand-600" />
            Categories
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
              {categories.length}
            </span>
            <ChevronDownIcon className="ml-auto h-4 w-4 text-zinc-400 transition-transform group-open/cat:rotate-180" />
          </summary>
          <div className="border-t border-zinc-100 p-4">
            <CategoryManager />
          </div>
        </details>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        {/* On a phone only name, price and stock show; category and status move under the name. */}
        <table className="w-full text-left text-sm sm:min-w-[640px] lg:min-w-0">
          <thead>
            <tr className="border-b border-zinc-100 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              {sortHeader("name", "Product")}
              <th className="hidden px-4 py-3 font-medium md:table-cell">Category</th>
              {sortHeader("price", "Price", true)}
              {sortHeader("stock", "Stock", true)}
              <th className="hidden px-4 py-3 font-medium md:table-cell">Status</th>
              <th className="hidden px-4 py-3 sm:table-cell" />
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
            {products.map((product, index) => {
              const stock = toNum(product.stockQty);
              const reorder = toNum(product.reorderLevel);
              const low = product.trackStock && reorder > 0 && stock <= reorder;
              // Designs sort together ("Group – Design"), so a header goes before the first one.
              const startsGroup =
                showGroups &&
                product.groupId !== null && product.groupId !== products[index - 1]?.groupId;

              return (
                <Fragment key={product.id}>
                {startsGroup && (
                  <tr className="bg-zinc-50">
                    <td colSpan={6} className="px-4 py-2">
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-700">
                        <LayersIcon className="h-3.5 w-3.5 text-brand-600" />
                        {product.group?.name}
                        <span className="font-normal text-zinc-400">
                          · {product.group?._count.products} designs
                        </span>
                      </span>
                    </td>
                  </tr>
                )}
                <tr className="hover:bg-zinc-50">
                  <td className={`py-3 pr-2 sm:pr-4 ${showGroups && product.groupId ? "pl-6 sm:pl-10" : "pl-3 sm:pl-4"}`}>
                    <div className="flex items-center gap-3">
                      <span className="hidden sm:block">
                        <ProductThumb src={product.imageUrl} name={product.name} />
                      </span>
                      <div className="min-w-0">
                        <p className="font-medium text-zinc-900">
                          {canManage ? (
                            <Link href={`/products/${product.id}`} className="hover:text-brand-700 hover:underline">
                              {(showGroups && variantLabel(product)) || product.name}
                            </Link>
                          ) : (
                            (showGroups && variantLabel(product)) || product.name
                          )}
                        </p>
                        <p className="text-xs text-zinc-400">
                          {product.sku ?? "No SKU"}
                          {product.unit !== "pcs" ? ` · per ${product.unit}` : ""}
                          {product.category && <span className="md:hidden"> · {product.category.name}</span>}
                          {!product.isActive && <span className="font-medium text-zinc-500 md:hidden"> · Inactive</span>}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="hidden px-4 py-3 text-zinc-600 md:table-cell">
                    {product.category?.name ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right font-medium text-zinc-900 sm:px-4">
                    {formatMoney(toNum(product.price), settings.currency)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right sm:px-4">
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
                  <td className="hidden px-4 py-3 md:table-cell">
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
                  <td className="hidden px-4 py-3 sm:table-cell">
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
                          <ConfirmForm
                            action={toggleProductActiveAction}
                            successMessage={
                              product.isActive
                                ? `${product.name} deactivated`
                                : `${product.name} is active again`
                            }
                          >
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
                          </ConfirmForm>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {products.length > 0 && (
        <nav className="mt-3 flex items-center justify-between text-sm text-zinc-500" aria-label="Pages">
          <span className="tabular-nums">
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
          </span>
          {pageCount > 1 && (
            <div className="flex items-center gap-1">
              {[
                { to: page - 1, label: "Previous", Icon: ChevronLeftIcon },
                { to: page + 1, label: "Next", Icon: ChevronRightIcon },
              ].map(({ to, label, Icon }) =>
                to < 1 || to > pageCount ? (
                  <span key={label} className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-300">
                    <Icon className="h-4 w-4" />
                  </span>
                ) : (
                  <Link
                    key={label}
                    href={href({ page: to })}
                    title={label}
                    aria-label={label}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-700 transition hover:bg-zinc-50"
                  >
                    <Icon className="h-4 w-4" />
                  </Link>
                )
              )}
              <span className="ml-1 tabular-nums">
                Page {page} of {pageCount}
              </span>
            </div>
          )}
        </nav>
      )}
    </>
  );
}
