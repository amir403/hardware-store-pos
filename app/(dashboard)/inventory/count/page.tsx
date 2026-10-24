import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { prisma } from "@/app/lib/prisma";
import { getCurrentUser, hasRole } from "@/app/lib/auth";
import { formatQty, toNum } from "@/app/lib/format";
import { stockCountAction } from "@/app/actions/inventory";
import { PageHeader } from "@/app/components/page-header";
import { ConfirmForm } from "@/app/components/confirm-form";
import { SubmitButton } from "@/app/components/submit-button";
import { PrintButton } from "@/app/components/print-button";

export const metadata = { title: "Stock count" };

export default async function StockCountPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const user = await getCurrentUser();
  if (!hasRole(user, "ADMIN", "MANAGER")) redirect("/");

  const { category = "" } = await searchParams;
  const [categories, products] = await Promise.all([
    prisma.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.product.findMany({
      where: { isActive: true, trackStock: true, ...(category ? { categoryId: category } : {}) },
      orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        sku: true,
        unit: true,
        stockQty: true,
        category: { select: { name: true } },
      },
    }),
  ]);

  return (
    <>
      <div className="mb-4 print:hidden">
        <Link
          href="/inventory"
          className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900"
        >
          <ArrowLeftIcon className="h-4 w-4" /> Back to inventory
        </Link>
      </div>
      <PageHeader
        title="Stock count"
        description="Count the shelf, type what you find, apply once. Rows left blank are not changed."
        actions={<PrintButton label="Print count sheet" />}
      />

      <form action="/inventory/count" className="mb-4 flex gap-2 print:hidden">
        <select
          name="category"
          defaultValue={category}
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
          Show
        </button>
      </form>

      <ConfirmForm
        action={stockCountAction}
        message="Apply these counts? Every changed row is recorded as a stock adjustment."
        successMessage="Stock count applied"
        className="flex flex-col gap-4"
      >
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
          <table className="w-full min-w-[560px] text-left text-sm lg:min-w-0">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-4 py-2.5 font-medium">Product</th>
                <th className="px-4 py-2.5 font-medium">Category</th>
                <th className="px-4 py-2.5 text-right font-medium">System</th>
                <th className="px-4 py-2.5 font-medium">Counted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {products.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-sm text-zinc-400">
                    No stock-tracked products here.
                  </td>
                </tr>
              )}
              {products.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-2">
                    <p className="font-medium text-zinc-900">{p.name}</p>
                    {p.sku && <p className="text-xs text-zinc-400">{p.sku}</p>}
                  </td>
                  <td className="px-4 py-2 text-zinc-600">{p.category?.name ?? "—"}</td>
                  <td className="px-4 py-2 text-right text-zinc-600">
                    {formatQty(toNum(p.stockQty))} {p.unit}
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      name={`count:${p.id}`}
                      min="0"
                      step="any"
                      aria-label={`Counted ${p.name}`}
                      className="h-8 w-28 rounded-md border border-zinc-300 bg-white px-2 text-right text-sm text-zinc-900 outline-none focus:border-zinc-900 print:border-zinc-400"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end print:hidden">
          <SubmitButton pendingLabel="Applying…">Apply count</SubmitButton>
        </div>
      </ConfirmForm>
    </>
  );
}
