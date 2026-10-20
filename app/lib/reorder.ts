import { prisma } from "@/app/lib/prisma";
import { toNum } from "@/app/lib/format";

/**
 * What to buy back in, for every product sitting at or below its reorder
 * level. Products and their last supplier are discovered from purchase
 * history, because a product is not linked to a supplier in the schema — the
 * link only exists in the order that was last raised for it.
 */
export type ReorderLine = {
  productId: string;
  name: string;
  unit: string;
  stock: number;
  reorderLevel: number;
  suggestedQty: number;
  lastUnitCost: number | null;
  supplierId: string | null;
  supplierName: string | null;
};

/**
 * Top the shelf back up to twice the reorder level. Doubling is deliberate:
 * ordering only the shortfall puts the item straight back into "low" as soon
 * as the next sale lands. Whole units only, minimum 1.
 */
function suggestedQty(stock: number, reorderLevel: number): number {
  return Math.max(1, Math.ceil(reorderLevel * 2 - stock));
}

export async function getReorderPlan(): Promise<ReorderLine[]> {
  const tracked = await prisma.product.findMany({
    where: { isActive: true, trackStock: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      unit: true,
      stockQty: true,
      reorderLevel: true,
    },
  });

  // Prisma cannot compare two columns, so the filter stays in JS (same rule
  // the inventory page uses, so both views agree on what "low" means).
  const low = tracked
    .map((p) => ({
      ...p,
      stock: toNum(p.stockQty),
      level: toNum(p.reorderLevel),
    }))
    .filter((p) => p.level > 0 && p.stock <= p.level);

  if (low.length === 0) return [];

  const history = await prisma.purchaseItem.findMany({
    where: { productId: { in: low.map((p) => p.id) } },
    orderBy: { purchase: { createdAt: "desc" } },
    take: 1000,
    select: {
      productId: true,
      unitCost: true,
      purchase: {
        select: {
          supplierId: true,
          supplier: { select: { name: true } },
        },
      },
    },
  });

  // Already newest-first, so the first row seen per product is its last buy.
  const lastByProduct = new Map<string, (typeof history)[number]>();
  for (const row of history) {
    if (!lastByProduct.has(row.productId)) lastByProduct.set(row.productId, row);
  }

  return low.map((p) => {
    const last = lastByProduct.get(p.id);
    return {
      productId: p.id,
      name: p.name,
      unit: p.unit,
      stock: p.stock,
      reorderLevel: p.level,
      suggestedQty: suggestedQty(p.stock, p.level),
      lastUnitCost: last ? toNum(last.unitCost) : null,
      supplierId: last?.purchase.supplierId ?? null,
      supplierName: last?.purchase.supplier?.name ?? null,
    };
  });
}

/** Groups a plan by supplier, keeping unnamed suppliers in one bucket. */
export function groupBySupplier(plan: ReorderLine[]): {
  supplierId: string | null;
  supplierName: string;
  lines: ReorderLine[];
  value: number;
}[] {
  const groups = new Map<string, { supplierId: string | null; supplierName: string; lines: ReorderLine[] }>();
  for (const line of plan) {
    const key = line.supplierId ?? "";
    const existing = groups.get(key);
    if (existing) {
      existing.lines.push(line);
    } else {
      groups.set(key, {
        supplierId: line.supplierId,
        supplierName: line.supplierName ?? "Unknown supplier",
        lines: [line],
      });
    }
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      value: group.lines.reduce(
        (sum, line) => sum + line.suggestedQty * (line.lastUnitCost ?? 0),
        0
      ),
    }))
    .sort((a, b) => a.supplierName.localeCompare(b.supplierName));
}
