import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { prisma } from "@/app/lib/prisma";
import { getCurrentUser, hasRole } from "@/app/lib/auth";
import { getSettings } from "@/app/lib/settings";
import { formatDate, round3, toNum } from "@/app/lib/format";
import { PageHeader } from "@/app/components/page-header";
import {
  SupplierReturnForm,
  type ReturnablePurchaseItem,
} from "@/app/components/purchases/supplier-return-form";

export const metadata = { title: "Return to supplier" };

export default async function ReturnToSupplierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!hasRole(user, "ADMIN", "MANAGER")) redirect("/");

  const { id } = await params;
  const [purchase, settings] = await Promise.all([
    prisma.purchase.findUnique({
      where: { id },
      include: {
        supplier: { select: { name: true } },
        items: {
          include: {
            product: { select: { name: true, trackStock: true, stockQty: true } },
            returnItems: { select: { quantity: true } },
          },
        },
      },
    }),
    getSettings(),
  ]);
  if (!purchase) notFound();

  const items: ReturnablePurchaseItem[] = purchase.items.map((item) => {
    const bought = toNum(item.quantity);
    const notReturned = round3(
      bought - item.returnItems.reduce((sum, r) => sum + toNum(r.quantity), 0)
    );
    return {
      id: item.id,
      name: item.product.name,
      bought,
      canReturn: item.product.trackStock
        ? Math.max(0, Math.min(notReturned, toNum(item.product.stockQty)))
        : notReturned,
      unitCost: toNum(item.unitCost),
    };
  });

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4">
        <Link
          href={`/purchases/${purchase.id}`}
          className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900"
        >
          <ArrowLeftIcon className="h-4 w-4" /> Back to purchase
        </Link>
      </div>
      <PageHeader
        title="Return to supplier"
        description={`${purchase.referenceNo ?? `Purchase ${formatDate(purchase.createdAt)}`} · ${purchase.supplier?.name ?? "No supplier"} · stock goes down and the value comes off what you owe`}
      />
      <SupplierReturnForm purchaseId={purchase.id} items={items} currency={settings.currency} />
    </div>
  );
}
