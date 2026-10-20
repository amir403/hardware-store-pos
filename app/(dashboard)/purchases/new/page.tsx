import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { prisma } from "@/app/lib/prisma";
import { getCurrentUser, hasRole } from "@/app/lib/auth";
import { getSettings } from "@/app/lib/settings";
import { toNum } from "@/app/lib/format";
import { getReorderPlan } from "@/app/lib/reorder";
import { PageHeader } from "@/app/components/page-header";
import {
  PurchaseForm,
  type PurchaseLineSeed,
  type PurchaseProduct,
} from "@/app/components/purchases/purchase-form";

export const metadata = { title: "New purchase" };

export default async function NewPurchasePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; supplier?: string }>;
}) {
  const user = await getCurrentUser();
  if (!hasRole(user, "ADMIN", "MANAGER")) {
    redirect("/");
  }

  const params = await searchParams;
  const isReorder = params.from === "lowstock";
  // "all" is the literal value the inventory page sends when no single
  // supplier was chosen; an empty supplierId then means "unknown supplier".
  const supplierFilter = params.supplier ?? "";

  const [settings, products, suppliers, plan] = await Promise.all([
    getSettings(),
    prisma.product.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.supplier.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    isReorder ? getReorderPlan() : Promise.resolve([]),
  ]);

  const purchaseProducts: PurchaseProduct[] = products.map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    costPrice: toNum(p.costPrice),
    unit: p.unit,
    trackStock: p.trackStock,
  }));

  const wanted =
    !isReorder || supplierFilter === "all"
      ? plan
      : plan.filter((line) => (line.supplierId ?? "") === supplierFilter);

  // A reorder line the catalog no longer offers (deactivated since) is dropped
  // rather than silently added at zero cost.
  const byId = new Map(products.map((p) => [p.id, p]));
  const initialLines: PurchaseLineSeed[] = wanted.flatMap((line) => {
    const product = byId.get(line.productId);
    if (!product) return [];
    return [
      {
        productId: line.productId,
        name: line.name,
        unit: line.unit,
        quantity: line.suggestedQty,
        unitCost: line.lastUnitCost ?? toNum(product.costPrice),
      },
    ];
  });

  // Only pre-select a supplier when the draft was raised for one.
  const draftSupplier =
    supplierFilter && supplierFilter !== "all" ? supplierFilter : "";

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href={isReorder ? "/inventory" : "/purchases"}
        className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        {isReorder ? "Back to inventory" : "Back to purchases"}
      </Link>

      <PageHeader
        title="Record purchase"
        description="Stock received from a supplier"
      />

      {isReorder && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {initialLines.length === 0 ? (
            <p>
              Nothing is below its reorder level right now — record the purchase
              as usual.
            </p>
          ) : (
            <p>
              <span className="font-semibold">
                {initialLines.length} low-stock line
                {initialLines.length === 1 ? "" : "s"}
              </span>{" "}
              pre-filled from purchase history. Quantities top each shelf back
              up to twice its reorder level and costs are the last paid — adjust
              both before saving.{" "}
              <Link
                href="/purchases/new"
                className="font-medium underline decoration-amber-400 underline-offset-2"
              >
                Start empty instead
              </Link>
            </p>
          )}
        </div>
      )}

      <div className="rounded-xl border border-zinc-200 bg-white p-6">
        <PurchaseForm
          products={purchaseProducts}
          suppliers={suppliers}
          currency={settings.currency}
          initialLines={initialLines}
          initialSupplierId={isReorder ? draftSupplier : ""}
          initialNote={
            isReorder
              ? `Reorder — ${initialLines.length} item${
                  initialLines.length === 1 ? "" : "s"
                } below reorder level`
              : ""
          }
        />
      </div>
    </div>
  );
}
