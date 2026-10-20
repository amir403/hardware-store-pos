"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/app/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";
import { getActionUser, hasRole } from "@/app/lib/auth";
import { getSettings } from "@/app/lib/settings";
import { getCustomerBalance } from "@/app/lib/ledger";
import { round2, round3, toNum } from "@/app/lib/format";

/** What a caller may send — the pre-transform shape, so dates stay strings. */
export type CreateSaleInput = z.input<typeof createSaleSchema>;
export type HoldSaleInput = z.input<typeof holdSaleSchema>;

export type CreateSaleResult =
  | { saleId: string; invoiceNo: string }
  | { error: string };

const saleItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().positive().max(9_999_999),
  unitPrice: z.number().min(0).max(99_999_999),
  discount: z.number().min(0).max(99_999_999).default(0),
});

/** Empty string and undefined both collapse to null for optional FK columns. */
const nullableId = z
  .string()
  .nullable()
  .optional()
  .transform((v) => (v === "" || v === undefined ? null : v));

const nullableNote = z
  .string()
  .max(300)
  .nullable()
  .optional()
  .transform((v) => (v && v.trim() === "" ? null : v ?? null));

/** <input type="date"> gives "YYYY-MM-DD"; treat the due date as inclusive. */
const nullableDueDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Due date must be a real date.")
  .nullable()
  .optional()
  .transform((v) => (v ? new Date(`${v}T23:59:59`) : null));

const createSaleSchema = z.object({
  items: z.array(saleItemSchema).min(1, "Cart is empty"),
  customerId: nullableId,
  discountAmount: z.number().min(0).max(99_999_999).default(0),
  paymentMethod: z.enum(["CASH", "CARD", "BANK_TRANSFER", "MOBILE", "OTHER"]),
  paidAmount: z.number().min(0).max(99_999_999),
  dueDate: nullableDueDate,
  note: nullableNote,
  /** A recalled held bill is superseded by the completed sale. */
  replaceHeldSaleId: nullableId,
});

const holdSaleSchema = z.object({
  items: z.array(saleItemSchema).min(1, "Cart is empty"),
  customerId: nullableId,
  discountAmount: z.number().min(0).max(99_999_999).default(0),
  note: nullableNote,
  /** Set when re-parking a bill that is already on hold. */
  replaceHeldSaleId: nullableId,
});

class SaleValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SaleValidationError";
  }
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

async function buildInvoiceNo(tx: Prisma.TransactionClient): Promise<string> {
  const now = new Date();
  const dateStr = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");
  const count = await tx.sale.count({
    where: { createdAt: { gte: startOfDay(now) } },
  });
  return `INV-${dateStr}-${String(count + 1).padStart(4, "0")}`;
}

type SaleLineInput = {
  productId: string;
  quantity: number;
  unitPrice: number;
  discount: number;
};

type PricedLine = SaleLineInput & {
  productName: string;
  lineTotal: number;
  trackStock: boolean;
};

/**
 * Single source of truth for sale money math, shared by completed sales and
 * held bills so a recalled park totals exactly what the cashier first saw.
 */
async function priceSaleLines(
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

export async function createSaleAction(
  input: CreateSaleInput
): Promise<CreateSaleResult> {
  const user = await getActionUser();

  const parsed = createSaleSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid sale data." };
  }

  const data = parsed.data;
  const settings = await getSettings();

  // Max 3 attempts in case of invoice-number collision.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const sale = await prisma.$transaction(async (tx) => {
        const { lines, subtotal, taxAmount, discountAmount, total } =
          await priceSaleLines(tx, data.items, data.discountAmount, {
            pricesIncludeTax: settings.pricesIncludeTax,
            checkStock: true,
          });

        // Paying less than the total puts the difference on the customer's
        // account. Anything left over at the counter is change, never a credit.
        const paidAmount = round2(Math.min(data.paidAmount, total));
        const balanceDue = round2(total - paidAmount);
        const changeAmount = round2(Math.max(0, data.paidAmount - total));

        if (balanceDue > 0) {
          if (!data.customerId) {
            throw new SaleValidationError(
              "Choose a customer before leaving a balance on credit."
            );
          }

          const customer = await tx.customer.findUnique({
            where: { id: data.customerId },
          });
          if (!customer) {
            throw new SaleValidationError(
              "The selected customer no longer exists."
            );
          }

          if (customer.creditLimit !== null) {
            const { outstanding } = await getCustomerBalance(customer.id, tx);
            const limit = toNum(customer.creditLimit);
            if (outstanding + balanceDue > limit) {
              throw new SaleValidationError(
                `${customer.name} would pass their credit limit of ${limit}. ` +
                  `Already outstanding ${outstanding}, this bill adds ${balanceDue}.`
              );
            }
          }
        }

        // Create the sale with items
        const created = await tx.sale.create({
          data: {
            invoiceNo: await buildInvoiceNo(tx),
            customerId: data.customerId,
            userId: user.id,
            status: "COMPLETED",
            paymentMethod: data.paymentMethod,
            subtotal,
            discountAmount,
            taxAmount,
            total,
            paidAmount,
            changeAmount,
            // A due date only means something while a balance is open.
            dueDate: balanceDue > 0 ? data.dueDate : null,
            note: data.note,
            items: {
              create: lines.map((line) => ({
                productId: line.productId,
                productName: line.productName,
                quantity: line.quantity,
                unitPrice: line.unitPrice,
                discount: line.discount,
                lineTotal: line.lineTotal,
              })),
            },
          },
        });

        // Decrement stock + audit trail
        for (const line of lines) {
          if (!line.trackStock) continue;
          await tx.product.update({
            where: { id: line.productId },
            data: { stockQty: { decrement: line.quantity } },
          });
          await tx.stockMovement.create({
            data: {
              productId: line.productId,
              type: "SALE",
              quantityChange: -line.quantity,
              saleId: created.id,
              userId: user.id,
              reason: `Sale ${created.invoiceNo}`,
            },
          });
        }

        // A recalled park is replaced by this completed sale, never double-counted.
        if (data.replaceHeldSaleId) {
          await tx.sale.deleteMany({
            where: { id: data.replaceHeldSaleId, status: "HELD" },
          });
        }

        return created;
      });

      revalidatePath("/pos");
      revalidatePath("/sales");
      revalidatePath("/");
      revalidatePath("/inventory");

      return { saleId: sale.id, invoiceNo: sale.invoiceNo };
    } catch (error) {
      if (error instanceof SaleValidationError) {
        return { error: error.message };
      }
      // Unique invoice-no collision: retry with a new number.
      const isUniqueViolation =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "P2002";
      if (isUniqueViolation && attempt < 2) continue;
      console.error("createSale failed:", error);
      return { error: "Failed to complete the sale. Please try again." };
    }
  }

  return { error: "Failed to generate an invoice number. Please try again." };
}

/**
 * Park the current cart as a HELD bill. Stock is deliberately left untouched —
 * it is only committed once the sale is completed from the POS terminal.
 */
export async function holdSaleAction(
  input: HoldSaleInput
): Promise<CreateSaleResult> {
  const user = await getActionUser();

  const parsed = holdSaleSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid bill data." };
  }

  const data = parsed.data;
  const settings = await getSettings();

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const sale = await prisma.$transaction(async (tx) => {
        const { lines, subtotal, taxAmount, discountAmount, total } =
          await priceSaleLines(tx, data.items, data.discountAmount, {
            pricesIncludeTax: settings.pricesIncludeTax,
            // Parking must not fail on availability; that is enforced on completion.
            checkStock: false,
          });

        const created = await tx.sale.create({
          data: {
            invoiceNo: await buildInvoiceNo(tx),
            customerId: data.customerId,
            userId: user.id,
            status: "HELD",
            subtotal,
            discountAmount,
            taxAmount,
            total,
            paidAmount: 0,
            changeAmount: 0,
            note: data.note,
            items: {
              create: lines.map((line) => ({
                productId: line.productId,
                productName: line.productName,
                quantity: line.quantity,
                unitPrice: line.unitPrice,
                discount: line.discount,
                lineTotal: line.lineTotal,
              })),
            },
          },
        });

        // Re-parking the same bill replaces its previous HELD row.
        if (data.replaceHeldSaleId && data.replaceHeldSaleId !== created.id) {
          await tx.sale.deleteMany({
            where: { id: data.replaceHeldSaleId, status: "HELD" },
          });
        }

        return created;
      });

      revalidatePath("/pos");
      revalidatePath("/sales");
      return { saleId: sale.id, invoiceNo: sale.invoiceNo };
    } catch (error) {
      if (error instanceof SaleValidationError) {
        return { error: error.message };
      }
      const isUniqueViolation =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "P2002";
      if (isUniqueViolation && attempt < 2) continue;
      console.error("holdSale failed:", error);
      return { error: "Failed to hold the bill. Please try again." };
    }
  }

  return { error: "Failed to generate an invoice number. Please try again." };
}

/** Throw away a parked bill. Only HELD rows can be discarded this way. */
export async function discardHeldSaleAction(formData: FormData) {
  await getActionUser();

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await prisma.sale.deleteMany({ where: { id, status: "HELD" } });

  revalidatePath("/pos");
  revalidatePath("/sales");
}

/**
 * Refund a completed sale in full: flag it REFUNDED and put every tracked line
 * back on the shelf. Restricted to ADMIN/MANAGER because it reverses revenue
 * that has already been recognised. The original payment figures are kept as an
 * audit record; reports exclude non-COMPLETED sales so revenue stays correct.
 */
export async function refundSaleAction(formData: FormData) {
  const user = await getActionUser();
  if (!hasRole(user, "ADMIN", "MANAGER")) {
    throw new Error("Only managers and admins can refund a sale.");
  }

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const refunded = await prisma.$transaction(async (tx) => {
    const sale = await tx.sale.findFirst({
      where: { id, status: "COMPLETED" },
      include: {
        items: {
          include: { product: { select: { trackStock: true } } },
        },
      },
    });
    if (!sale) return null;

    for (const item of sale.items) {
      if (!item.product.trackStock) continue;
      await tx.product.update({
        where: { id: item.productId },
        data: { stockQty: { increment: item.quantity } },
      });
      await tx.stockMovement.create({
        data: {
          productId: item.productId,
          type: "RETURN",
          quantityChange: item.quantity,
          saleId: sale.id,
          userId: user.id,
          reason: `Refund ${sale.invoiceNo}`,
        },
      });
    }

    await tx.sale.update({
      where: { id: sale.id },
      data: { status: "REFUNDED" },
    });

    return sale;
  });

  if (!refunded) return;

  revalidatePath("/sales");
  revalidatePath(`/sales/${id}`);
  revalidatePath("/");
  revalidatePath("/inventory");
  revalidatePath("/pos");
}

/**
 * Void an entry that should never have been made — a mis-keyed bill or a
 * duplicate. Stock goes back the same way a refund does, but it is logged as an
 * ADJUSTMENT and the sale ends up VOID, so the original entry is still there to
 * explain the gap in the invoice sequence.
 *
 * Two deliberate controls, because a void is the classic way to skim a till:
 * a written reason is mandatory, and only same-day sales can be voided — once a
 * day has been reported, a correction has to go through a refund instead.
 */
export async function voidSaleAction(formData: FormData) {
  const user = await getActionUser();
  if (!hasRole(user, "ADMIN", "MANAGER")) {
    throw new Error("Only managers and admins can void a sale.");
  }

  const id = String(formData.get("id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!id) return;
  if (reason.length < 3) {
    throw new SaleValidationError(
      "A reason is required before a sale can be voided."
    );
  }

  const voided = await prisma.$transaction(async (tx) => {
    const sale = await tx.sale.findFirst({
      where: { id, status: "COMPLETED" },
      include: {
        items: {
          include: { product: { select: { trackStock: true } } },
        },
      },
    });
    if (!sale) return null;

    if (sale.createdAt.getTime() < startOfDay(new Date()).getTime()) {
      throw new SaleValidationError(
        `Only sales created today can be voided. Refund ${sale.invoiceNo} instead.`
      );
    }

    for (const item of sale.items) {
      if (!item.product.trackStock) continue;
      await tx.product.update({
        where: { id: item.productId },
        data: { stockQty: { increment: item.quantity } },
      });
      await tx.stockMovement.create({
        data: {
          productId: item.productId,
          type: "ADJUSTMENT",
          quantityChange: item.quantity,
          saleId: sale.id,
          userId: user.id,
          reason: `Void ${sale.invoiceNo}`,
        },
      });
    }

    // No audit table yet, so the reason is appended to the sale's own note.
    const auditLine = `Voided by ${user.name ?? user.id}: ${reason}`;

    await tx.sale.update({
      where: { id: sale.id },
      data: {
        status: "VOID",
        note: sale.note ? `${sale.note}\n${auditLine}` : auditLine,
      },
    });

    return sale;
  });

  if (!voided) return;

  revalidatePath("/sales");
  revalidatePath(`/sales/${id}`);
  revalidatePath("/");
  revalidatePath("/inventory");
  revalidatePath("/pos");
}
