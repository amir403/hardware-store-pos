import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/app/lib/prisma";
import { getCurrentUser, hasRole } from "@/app/lib/auth";
import { getSettings } from "@/app/lib/settings";
import { formatDateTime, formatMoney, formatQty, toNum } from "@/app/lib/format";
import { getReorderPlan, groupBySupplier } from "@/app/lib/reorder";
import { PageHeader } from "@/app/components/page-header";
import { SubmitButton } from "@/app/components/submit-button";
import { adjustStockAction } from "@/app/actions/inventory";
import { ConfirmForm } from "@/app/components/confirm-form";

export const metadata = { title: "Inventory" };

const MOVEMENT_STYLES: Record<string, string> = {
  PURCHASE: "bg-emerald-50 text-emerald-700",
  SALE: "bg-blue-50 text-blue-700",
  RETURN: "bg-violet-50 text-violet-700",
  ADJUSTMENT: "bg-amber-50 text-amber-700",
  DAMAGE: "bg-red-50 text-red-700",
};

export default async function InventoryPage() {
  const user = await getCurrentUser();
  if (!hasRole(user, "ADMIN", "MANAGER")) {
    redirect("/");
  }

  // The plan is the single definition of "low" here, so the list and the
  // reorder drafts under it can never disagree.
  const [settings, plan, movements, products] = await Promise.all([
    getSettings(),
    getReorderPlan(),
    prisma.stockMovement.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        product: { select: { name: true } },
        user: { select: { name: true } },
      },
    }),
    prisma.product.findMany({
      where: { isActive: true, trackStock: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        stockQty: true,
        unit: true,
      },
    }),
  ]);

  const groups = groupBySupplier(plan);

  return (
    <>
      <PageHeader
        title="Inventory"
        description="Stock movements, low stock and adjustments"
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Movements */}
        <div className="xl:col-span-2">
          <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
            <div className="border-b border-zinc-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-zinc-900">
                Recent stock movements
              </h2>
            </div>
            <table className="w-full min-w-[640px] text-left lg:min-w-0 text-sm">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                  <th className="px-4 py-2.5 font-medium">Product</th>
                  <th className="px-4 py-2.5 font-medium">Type</th>
                  <th className="px-4 py-2.5 text-right font-medium">Change</th>
                  <th className="px-4 py-2.5 font-medium">Reason</th>
                  <th className="px-4 py-2.5 font-medium">By</th>
                  <th className="px-4 py-2.5 font-medium">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {movements.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-10 text-center text-sm text-zinc-400"
                    >
                      No stock movements yet.
                    </td>
                  </tr>
                )}
                {movements.map((m) => {
                  const change = toNum(m.quantityChange);
                  return (
                    <tr key={m.id} className="hover:bg-zinc-50">
                      <td className="px-4 py-2.5 font-medium text-zinc-900">
                        {m.product.name}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            MOVEMENT_STYLES[m.type] ?? "bg-zinc-100 text-zinc-600"
                          }`}
                        >
                          {m.type}
                        </span>
                      </td>
                      <td
                        className={`px-4 py-2.5 text-right font-semibold ${
                          change > 0 ? "text-emerald-600" : "text-red-600"
                        }`}
                      >
                        {change > 0 ? "+" : ""}
                        {formatQty(change)}
                      </td>
                      <td className="max-w-40 truncate px-4 py-2.5 text-zinc-500">
                        {m.reason ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-zinc-500">
                        {m.user?.name ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-zinc-500">
                        {formatDateTime(m.createdAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right column: low stock + adjust */}
        <div className="flex flex-col gap-6">
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
            <div className="border-b border-zinc-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-zinc-900">
                Low stock ({plan.length})
              </h2>
            </div>
            {plan.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-zinc-400">
                Nothing below reorder level.
              </p>
            ) : (
              <>
                <ul className="divide-y divide-zinc-100">
                  {plan.map((line) => (
                    <li
                      key={line.productId}
                      className="flex items-center justify-between px-4 py-2.5 text-sm"
                    >
                      <span className="min-w-0 truncate font-medium text-zinc-900">
                        {line.name}
                      </span>
                      <span className="ml-2 flex shrink-0 items-baseline gap-2">
                        <span
                          className={`font-semibold ${
                            line.stock === 0
                              ? "text-red-600"
                              : "text-amber-600"
                          }`}
                        >
                          {formatQty(line.stock)} {line.unit}
                        </span>
                        <span className="text-xs text-zinc-400">
                          order {formatQty(line.suggestedQty)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>

                {/* One-click reorder draft, split by last supplier */}
                <div className="border-t border-zinc-100 bg-zinc-50 px-4 py-3">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Draft purchase order
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href="/purchases/new?from=lowstock&supplier=all"
                      className="inline-flex h-8 items-center rounded-lg bg-zinc-900 px-3 text-xs font-medium text-white transition hover:bg-zinc-700"
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
                        <span className="text-zinc-400">
                          {group.lines.length}
                        </span>
                      </Link>
                    ))}
                  </div>
                  <p className="mt-2 text-[11px] text-zinc-400">
                    Quantities top each item up to twice its reorder level; the
                    draft stays editable before it is saved.
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Stock adjustment */}
          <div className="rounded-xl border border-zinc-200 bg-white p-5">
            <h2 className="mb-1 text-sm font-semibold text-zinc-900">
              Adjust stock
            </h2>
            <p className="mb-4 text-xs text-zinc-400">
              Set the counted quantity — the difference is recorded as an
              adjustment.
            </p>
            <ConfirmForm
              action={adjustStockAction}
              successMessage="Stock adjusted"
              className="flex flex-col gap-3"
            >
              <select
                name="productId"
                required
                defaultValue=""
                className="h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-zinc-900"
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
              <input
                type="number"
                name="newQty"
                min="0"
                step="any"
                required
                placeholder="New counted quantity"
                className="h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-900"
              />
              <input
                type="text"
                name="reason"
                maxLength={200}
                placeholder="Reason (optional)"
                className="h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-900"
              />
              <SubmitButton>Apply adjustment</SubmitButton>
            </ConfirmForm>
          </div>
        </div>
      </div>
    </>
  );
}
