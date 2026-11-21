import { redirect } from "next/navigation";
import { prisma } from "@/app/lib/prisma";
import { getCurrentUser, hasRole } from "@/app/lib/auth";
import { getSettings } from "@/app/lib/settings";
import { formatMoney, toNum } from "@/app/lib/format";
import { canEncode } from "@/app/lib/barcode";
import { defaultLabelCount, parseLabelItems } from "@/app/lib/labels";
import { isLabelSize } from "@/app/lib/print-formats";
import { PageHeader } from "@/app/components/page-header";
import { LabelPicker, type LabelProduct } from "@/app/components/label-picker";

export const metadata = { title: "Barcode labels" };

export default async function BarcodeLabelsPage({
  searchParams,
}: {
  // `l` = id:count pairs coming back from the sheet; `purchase` = label what was just received.
  searchParams: Promise<{ l?: string | string[]; size?: string; purchase?: string }>;
}) {
  const user = await getCurrentUser();
  if (!hasRole(user, "ADMIN", "MANAGER")) redirect("/");

  const [settings, params] = await Promise.all([getSettings(), searchParams]);

  const [categories, rows, purchase] = await Promise.all([
    prisma.category.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.product.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      include: { category: { select: { name: true } } },
    }),
    params.purchase
      ? prisma.purchase.findUnique({
          where: { id: params.purchase },
          select: {
            referenceNo: true,
            createdAt: true,
            supplier: { select: { name: true } },
            items: { select: { productId: true, quantity: true, product: { select: { unit: true } } } },
          },
        })
      : null,
  ]);

  const products: LabelProduct[] = rows.map((p) => {
    const code = p.barcode ?? p.sku;
    return {
      id: p.id,
      name: p.name,
      categoryId: p.categoryId,
      categoryName: p.category?.name ?? null,
      sku: p.sku,
      barcode: p.barcode,
      code: code && canEncode(code) ? code : null,
      price: formatMoney(toNum(p.price), settings.currency),
      unit: p.unit,
      stockQty: toNum(p.stockQty),
      trackStock: p.trackStock,
    };
  });

  // A purchase pre-ticks what came in: one label per piece received.
  const initialSelection: [string, number][] = [];
  if (purchase) {
    const received = new Map<string, { unit: string; quantity: number }>();
    for (const item of purchase.items) {
      const line = received.get(item.productId) ?? { unit: item.product.unit, quantity: 0 };
      line.quantity += toNum(item.quantity);
      received.set(item.productId, line);
    }
    for (const [id, line] of received) initialSelection.push([id, defaultLabelCount(line.unit, line.quantity)]);
  } else {
    for (const item of parseLabelItems(params.l)) initialSelection.push([item.id, item.count]);
  }

  const notice = purchase
    ? `Ticked the ${purchase.items.length} item${purchase.items.length === 1 ? "" : "s"} from the purchase${
        purchase.referenceNo ? ` ${purchase.referenceNo}` : ""
      }${purchase.supplier ? ` from ${purchase.supplier.name}` : ""} — one label per piece received. Change any count before printing.`
    : undefined;

  return (
    <>
      <PageHeader
        title="Barcode labels"
        description="Tick the items to tag, set how many labels each needs, then print"
      />
      <LabelPicker
        products={products}
        categories={categories}
        initialSize={params.size && isLabelSize(params.size) ? params.size : settings.labelSize}
        initialSelection={initialSelection}
        notice={notice}
      />
    </>
  );
}
