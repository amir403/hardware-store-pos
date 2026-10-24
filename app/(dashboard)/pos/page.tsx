import { prisma } from "@/app/lib/prisma";
import { getSettings } from "@/app/lib/settings";
import { toNum } from "@/app/lib/format";
import Link from "next/link";
import { PageHeader } from "@/app/components/page-header";
import { getOpenShift } from "@/app/lib/shifts";
import { getCurrentUser } from "@/app/lib/auth";
import {
  PosTerminal,
  type PosHeldSale,
  type PosProduct,
} from "@/app/components/pos/pos-terminal";
import { getT } from "@/app/lib/i18n-server";

export const metadata = { title: "New Sale" };

export default async function PosPage({
  searchParams,
}: {
  searchParams: Promise<{ recall?: string }>;
}) {
  const [{ recall }, user, t] = await Promise.all([searchParams, getCurrentUser(), getT()]);
  const [settings, products, customers, heldRows, openShift] = await Promise.all([
    getSettings(),
    prisma.product.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      include: { category: { select: { name: true } } },
    }),
    prisma.customer.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, phone: true, priceTier: true },
    }),
    prisma.sale.findMany({
      where: { status: "HELD" },
      orderBy: { createdAt: "asc" },
      include: {
        items: { orderBy: { productName: "asc" } },
        customer: { select: { name: true } },
      },
    }),
    getOpenShift(),
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
    wholesalePrice: p.wholesalePrice === null ? null : toNum(p.wholesalePrice),
    taxRate: toNum(p.taxRate),
    stockQty: toNum(p.stockQty),
    unit: p.unit,
    trackStock: p.trackStock,
    categoryName: p.category?.name ?? null,
  }));

  return (
    <>
      <PageHeader
        title={t("New Sale")}
        description={settings.storeName}
      />
      {/* Selling is never blocked — but cash taken with no shift open cannot be
          reconciled against a drawer count. */}
      {!openShift && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span>
            {t("No shift is open. Open one so today's cash can be counted at closing.")}
          </span>
          <Link
            href="/shifts"
            className="inline-flex h-8 items-center rounded-lg bg-amber-600 px-3 text-xs font-medium text-white transition hover:bg-amber-500"
          >
            {t("Open shift")}
          </Link>
        </div>
      )}
      <PosTerminal
        key={recall ?? "pos"}
        products={posProducts}
        customers={customers}
        currency={settings.currency}
        pricesIncludeTax={settings.pricesIncludeTax}
        heldSales={heldSales}
        initialHeldId={recall ?? null}
        canEditPrices={user.role !== "CASHIER"}
      />
    </>
  );
}
