import type { Prisma } from "@/app/generated/prisma/client";
import { round2, round3 } from "@/app/lib/format";

/**
 * Pricing shared by everything that builds a bill: completed sales, held bills
 * and quotations. Kept out of the server-action file because a "use server"
 * module may only export actions.
 */

export class SaleValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SaleValidationError";
  }
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** "INV-20261020-" style prefix for today's running numbers. */
export function dailyPrefix(kind: string, now = new Date()): string {
  const dateStr = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");
  return `${kind}-${dateStr}-`;
}

/**
 * The number after the highest one already issued today. Counting today's
 * rows is not enough: held bills are deleted when completed or discarded, so a
 * count can fall behind and hand out a number that is still in use.
 */
export function nextDailyNumber(prefix: string, last: string | null): string {
  const lastSeq = last ? Number(last.slice(prefix.length)) || 0 : 0;
  return `${prefix}${String(lastSeq + 1).padStart(4, "0")}`;
}

export async function buildInvoiceNo(tx: Prisma.TransactionClient): Promise<string> {
  const prefix = dailyPrefix("INV");
  const last = await tx.sale.findFirst({
    where: { invoiceNo: { startsWith: prefix } },
    orderBy: { invoiceNo: "desc" },
    select: { invoiceNo: true },
  });
  return nextDailyNumber(prefix, last?.invoiceNo ?? null);
}

export type SaleLineInput = {
  productId: string;
  quantity: number;
  unitPrice: number;
  discount: number;
};

export type PricedLine = SaleLineInput & {
  productName: string;
  lineTotal: number;
  trackStock: boolean;
};

/**
 * Single source of truth for sale money math, shared by completed sales and
 * held bills so a recalled park totals exactly what the cashier first saw.
 */
export async function priceSaleLines(
  tx: Prisma.TransactionClient,
  items: SaleLineInput[],
  discountAmountRaw: number,
  opts: { pricesIncludeTax: boolean; checkStock: boolean }
): Promise<{
  lines: PricedLine[];
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  total: number;
}> {
  const products = await tx.product.findMany({
    where: { id: { in: items.map((item) => item.productId) } },
  });
  const productMap = new Map(products.map((p) => [p.id, p]));

  let subtotal = 0;
  let taxAmount = 0;

  const lines = items.map<PricedLine>((item) => {
    const product = productMap.get(item.productId);
    if (!product || !product.isActive) {
      throw new SaleValidationError(
        "One of the products is no longer available. Please refresh and try again."
      );
    }
    if (opts.checkStock && product.trackStock) {
      const available = Number(product.stockQty.toString());
      if (item.quantity > available) {
        throw new SaleValidationError(
          `Insufficient stock for "${product.name}" — only ${available} ${product.unit} available.`
        );
      }
    }

    const gross = round2(item.quantity * item.unitPrice);
    const lineTotal = round2(Math.max(0, gross - item.discount));
    const taxRate = Number(product.taxRate.toString());

    let lineTax = 0;
    if (taxRate > 0) {
      lineTax = opts.pricesIncludeTax
        ? round2((lineTotal * taxRate) / (100 + taxRate))
        : round2((lineTotal * taxRate) / 100);
    }

    subtotal = round2(subtotal + lineTotal);
    taxAmount = round2(taxAmount + lineTax);

    return {
      productId: product.id,
      productName: product.name,
      quantity: round3(item.quantity),
      unitPrice: round2(item.unitPrice),
      discount: round2(item.discount),
      lineTotal,
      trackStock: product.trackStock,
    };
  });

  const discountAmount = round2(Math.min(discountAmountRaw, subtotal));
  const total = opts.pricesIncludeTax
    ? round2(subtotal - discountAmount)
    : round2(subtotal - discountAmount + taxAmount);

  return { lines, subtotal, taxAmount, discountAmount, total };
}
