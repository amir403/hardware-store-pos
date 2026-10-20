import { prisma } from "@/app/lib/prisma";
import { getSettings } from "@/app/lib/settings";
import { toNum } from "@/app/lib/format";
import { PageHeader } from "@/app/components/page-header";
import {
  PosTerminal,
  type PosHeldSale,
  type PosProduct,
} from "@/app/components/pos/pos-terminal";

export const metadata = { title: "New Sale" };

export default async function PosPage() {
  const [settings, products, customers, heldRows] = await Promise.all([
    getSettings(),
    prisma.product.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      include: { category: { select: { name: true } } },
    }),
    prisma.customer.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.sale.findMany({
      where: { status: "HELD" },
      orderBy: { createdAt: "asc" },
      include: {
        items: { orderBy: { productName: "asc" } },
        customer: { select: { name: true } },
      },
    }),
  ]);

  const heldSales: PosHeldSale[] = heldRows.map((sale) => ({
    id: sale.id,
    invoiceNo: sale.invoiceNo,
    note: sale.note,
    customerId: sale.customerId,
    customerName: sale.customer?.name ?? null,
    discountAmount: toNum(sale.discountAmount),
    total: toNum(sale.total),
    itemCount: sale.items.length,
    createdAt: sale.createdAt.toISOString(),
    lines: sale.items.map((item) => ({
      productId: item.productId,
      productName: item.productName,
      quantity: toNum(item.quantity),
      unitPrice: toNum(item.unitPrice),
      discount: toNum(item.discount),
    })),
  }));

  const posProducts: PosProduct[] = products.map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    barcode: p.barcode,
    price: toNum(p.price),
    taxRate: toNum(p.taxRate),
    stockQty: toNum(p.stockQty),
    unit: p.unit,
    trackStock: p.trackStock,
    categoryName: p.category?.name ?? null,
  }));

  return (
    <>
      <PageHeader
        title="New Sale"
        description={settings.storeName}
      />
      <PosTerminal
        products={posProducts}
        customers={customers}
        currency={settings.currency}
        pricesIncludeTax={settings.pricesIncludeTax}
        heldSales={heldSales}
      />
    </>
  );
}
