import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { prisma } from "@/app/lib/prisma";
import { getCurrentUser, hasRole } from "@/app/lib/auth";
import { PageHeader } from "@/app/components/page-header";
import { ProductForm } from "@/app/components/product-form";
import { updateProductAction } from "@/app/actions/products";
import { ProductDesigns } from "@/app/components/product-designs";
import { getSettings } from "@/app/lib/settings";
import { formatDate, formatDateTime, formatMoney, formatQty, round2, round3, toNum } from "@/app/lib/format";
import { MOVEMENT_TYPES } from "@/app/lib/stock-movements";

export const metadata = { title: "Product" };

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  const { id } = await params;

  if (!hasRole(user, "ADMIN", "MANAGER")) notFound();

  const since = new Date();
  since.setDate(since.getDate() - 30);

  const [product, categories, groups, settings, sold, lastBuy, movements, returned] = await Promise.all([
    prisma.product.findUnique({
      where: { id },
      include: {
        category: { select: { name: true } },
        group: {
          include: { products: { orderBy: { variantName: "asc" } } },
        },
      },
    }),
    prisma.category.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.productGroup.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    getSettings(),
    prisma.saleItem.aggregate({
      where: { productId: id, sale: { status: "COMPLETED", createdAt: { gte: since } } },
      _sum: { quantity: true, lineTotal: true },
      _count: { _all: true },
    }),
    prisma.purchaseItem.findFirst({
      where: { productId: id },
      orderBy: { purchase: { createdAt: "desc" } },
      include: { purchase: { select: { id: true, createdAt: true, supplier: { select: { id: true, name: true } } } } },
    }),
    prisma.stockMovement.findMany({
      where: { productId: id },
      orderBy: { createdAt: "desc" },
      take: 12,
      include: {
        sale: { select: { id: true, invoiceNo: true } },
        purchase: { select: { id: true, referenceNo: true } },
        user: { select: { name: true } },
      },
    }),
    // Goods brought back from those same bills come off "sold".
    prisma.saleReturnItem.aggregate({
      where: { productId: id, saleItem: { sale: { status: "COMPLETED", createdAt: { gte: since } } } },
      _sum: { quantity: true, amount: true },
    }),
  ]);

  if (!product) notFound();

  const money = (n: number) => formatMoney(n, settings.currency);
  const stock = toNum(product.stockQty);
  const cost = toNum(product.costPrice);
  const price = toNum(product.price);
  const margin = price - cost;
  const soldQty = round3(toNum(sold._sum.quantity) - toNum(returned._sum.quantity));
  const soldValue = round2(toNum(sold._sum.lineTotal) - toNum(returned._sum.amount));
  const returnedQty = toNum(returned._sum.quantity);
  const low = product.trackStock && product.reorderLevel !== null && stock <= toNum(product.reorderLevel);

  const cards: { label: string; value: string; note: string; tone?: string; href?: string }[] = [
    {
      label: "In stock",
      value: product.trackStock ? `${formatQty(stock)} ${product.unit}` : "Not tracked",
      note: product.trackStock
        ? `${money(round2(stock * cost))} at cost${low ? " · at or below reorder level" : ""}`
        : "service or untracked item",
      tone: !product.trackStock ? undefined : stock <= 0 ? "text-red-700" : low ? "text-amber-700" : undefined,
    },
    {
      label: "Sold in 30 days",
      value: `${formatQty(soldQty)} ${product.unit}`,
      note: sold._count._all
        ? `${money(soldValue)} · ${sold._count._all} ${sold._count._all === 1 ? "bill" : "bills"}${
            returnedQty > 0 ? ` · ${formatQty(returnedQty)} returned` : ""
          }`
        : "no sales in the last 30 days",
    },
    {
      label: "Margin per unit",
      value: cost > 0 ? money(round2(margin)) : "—",
      note: cost > 0
        ? `${price > 0 ? Math.round((margin / price) * 100) : 0}% of ${money(price)} · cost ${money(cost)}`
        : "set a cost price to see profit",
      tone: cost > 0 && margin < 0 ? "text-red-700" : cost > 0 ? "text-emerald-700" : undefined,
    },
    {
      label: "Last purchase",
      value: lastBuy ? money(toNum(lastBuy.unitCost)) : "—",
      note: lastBuy
        ? `${formatQty(toNum(lastBuy.quantity))} ${product.unit} · ${lastBuy.purchase.supplier?.name ?? "no supplier"} · ${formatDate(lastBuy.purchase.createdAt)}`
        : "never bought through Purchases",
      href: lastBuy ? `/purchases/${lastBuy.purchase.id}` : undefined,
    },
  ];

  return (
    <div>
      <Link
        href="/products"
        className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900"
      >
        <ArrowLeftIcon className="h-4 w-4" /> Back to products
      </Link>

      <PageHeader
        title={product.name}
        description={[product.sku, product.category?.name, product.isActive ? null : "Deactivated"]
          .filter(Boolean)
          .join(" · ") || undefined}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => {
          const body = (
            <>
              <p className="text-xs font-medium text-zinc-500">{c.label}</p>
              <p className={`mt-1 text-lg font-semibold tracking-tight ${c.tone ?? "text-zinc-900"}`}>{c.value}</p>
              <p className="mt-0.5 text-xs leading-snug text-zinc-500">{c.note}</p>
            </>
          );
          const cls = "rounded-xl border border-zinc-200 bg-white p-4";
          return c.href ? (
            <Link key={c.label} href={c.href} className={`${cls} transition hover:border-brand-300 hover:shadow-sm`}>
              {body}
            </Link>
          ) : (
            <div key={c.label} className={cls}>
              {body}
            </div>
          );
        })}
      </div>

      <section className="mb-6 overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-zinc-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-900">Stock history</h2>
          {movements.length > 0 && (
            <Link
              href={`/inventory?q=${encodeURIComponent(product.name)}`}
              className="text-xs font-medium text-brand-700 hover:underline"
            >
              See all in Inventory
            </Link>
          )}
        </div>
        {movements.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-zinc-400">No stock has moved for this product yet.</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {movements.map((m) => {
              const change = toNum(m.quantityChange);
              const type = MOVEMENT_TYPES[m.type];
              const source = m.sale
                ? { href: `/sales/${m.sale.id}`, text: m.sale.invoiceNo }
                : m.purchase
                  ? { href: `/purchases/${m.purchase.id}`, text: m.purchase.referenceNo || "Purchase" }
                  : null;
              return (
                <li key={m.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span
                    className={`inline-flex w-24 shrink-0 justify-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${type?.style ?? "bg-zinc-100 text-zinc-600"}`}
                  >
                    {type?.label ?? m.type}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-zinc-700">
                      {source ? (
                        <Link href={source.href} className="font-medium text-zinc-900 hover:text-brand-700 hover:underline">
                          {source.text}
                        </Link>
                      ) : (
                        m.reason || "—"
                      )}
                    </p>
                    <p className="truncate text-xs text-zinc-400">
                      {formatDateTime(m.createdAt)}
                      {m.user ? ` · ${m.user.name}` : ""}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 font-semibold tabular-nums ${change < 0 ? "text-red-600" : "text-emerald-600"}`}
                  >
                    {change > 0 ? "+" : ""}
                    {formatQty(change)} <span className="text-xs font-normal text-zinc-400">{product.unit}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <h2 className="mb-3 text-sm font-semibold text-zinc-900">Edit details</h2>
      <div className="rounded-xl border border-zinc-200 bg-white p-6">
        <ProductForm
          // Remount after group changes rename the product, so the field shows it.
          key={product.updatedAt.toISOString()}
          action={updateProductAction}
          categories={categories}
          isEdit={true}
          isDesign={product.groupId !== null}
          defaults={{
            id: product.id,
            name: product.name,
            sku: product.sku ?? "",
            barcode: product.barcode ?? "",
            description: product.description ?? "",
            unit: product.unit,
            categoryId: product.categoryId ?? "",
            costPrice: String(product.costPrice ?? 0),
            price: String(product.price ?? 0),
            wholesalePrice:
              product.wholesalePrice === null ? "" : String(product.wholesalePrice),
            taxRate: String(product.taxRate ?? 0),
            stockQty: String(product.stockQty ?? 0),
            reorderLevel: String(product.reorderLevel ?? 0),
            trackStock: product.trackStock,
            imageUrl: product.imageUrl ?? "",
          }}
        />
      </div>

      <ProductDesigns
        product={{ id: product.id, name: product.name, price: toNum(product.price) }}
        currency={settings.currency}
        groups={groups}
        group={
          product.group && {
            id: product.group.id,
            name: product.group.name,
            designs: product.group.products.map((d) => ({
              id: d.id,
              variantName: d.variantName,
              size: d.size,
              color: d.color,
              price: toNum(d.price),
              stockQty: toNum(d.stockQty),
              unit: d.unit,
              trackStock: d.trackStock,
              imageUrl: d.imageUrl,
              barcode: d.barcode,
            })),
          }
        }
      />
    </div>
  );
}
