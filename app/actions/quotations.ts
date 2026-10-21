"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/app/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";
import { getActionUser } from "@/app/lib/auth";
import { getSettings } from "@/app/lib/settings";
import { recordAudit } from "@/app/lib/audit";
import { toNum } from "@/app/lib/format";
import {
  SaleValidationError,
  buildInvoiceNo,
  dailyPrefix,
  nextDailyNumber,
  priceSaleLines,
} from "@/app/lib/sale-pricing";

export type CreateQuotationInput = z.input<typeof quotationSchema>;

export type QuotationResult = { quotationId: string } | { error: string };

const QUOTE_VALID_DAYS = 7;

const quotationSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().positive().max(9_999_999),
        unitPrice: z.number().min(0).max(99_999_999),
        discount: z.number().min(0).max(99_999_999).default(0),
      })
    )
    .min(1, "Cart is empty"),
  customerId: z
    .string()
    .nullable()
    .optional()
    .transform((v) => (v ? v : null)),
  /** For a quote to someone without an account, e.g. a contractor. */
  customerName: z
    .string()
    .trim()
    .max(80)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null)),
  discountAmount: z.number().min(0).max(99_999_999).default(0),
  validUntil: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Valid-until must be a real date.")
    .nullable()
    .optional()
    .transform((v) => (v ? new Date(`${v}T23:59:59`) : null)),
  note: z
    .string()
    .max(300)
    .nullable()
    .optional()
    .transform((v) => (v && v.trim() !== "" ? v.trim() : null)),
});

async function buildQuoteNo(tx: Prisma.TransactionClient): Promise<string> {
  const prefix = dailyPrefix("QT");
  const last = await tx.quotation.findFirst({
    where: { quoteNo: { startsWith: prefix } },
    orderBy: { quoteNo: "desc" },
    select: { quoteNo: true },
  });
  return nextDailyNumber(prefix, last?.quoteNo ?? null);
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

/**
 * Save the POS cart as an estimate. Priced exactly like a sale (same tax and
 * discount rules) but nothing is reserved: stock and money only move once the
 * quote becomes a sale.
 */
export async function createQuotationAction(
  input: CreateQuotationInput
): Promise<QuotationResult> {
  const user = await getActionUser();

  const parsed = quotationSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid quotation." };
  }
  const data = parsed.data;
  const settings = await getSettings();

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const quote = await prisma.$transaction(async (tx) => {
        const { lines, subtotal, taxAmount, discountAmount, total } =
          await priceSaleLines(tx, data.items, data.discountAmount, {
            pricesIncludeTax: settings.pricesIncludeTax,
            checkStock: false,
          });

        return tx.quotation.create({
          data: {
            quoteNo: await buildQuoteNo(tx),
            customerId: data.customerId,
            customerName: data.customerId ? null : data.customerName,
            userId: user.id,
            subtotal,
            discountAmount,
            taxAmount,
            total,
            // Prices move; a quote is honoured for a week unless told otherwise.
            validUntil:
              data.validUntil ??
              new Date(
                new Date().getFullYear(),
                new Date().getMonth(),
                new Date().getDate() + QUOTE_VALID_DAYS,
                23,
                59,
                59
              ),
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
      });

      revalidatePath("/quotations");
      return { quotationId: quote.id };
    } catch (error) {
      if (error instanceof SaleValidationError) return { error: error.message };
      if (isUniqueViolation(error) && attempt < 2) continue;
      console.error("createQuotation failed:", error);
      return { error: "Failed to save the quotation. Please try again." };
    }
  }
  return { error: "Failed to generate a quotation number. Please try again." };
}

export type ConvertQuotationResult = { heldSaleId: string } | { error: string };

/**
 * Turn an open quotation into a held bill at the quoted prices, ready to be
 * recalled and completed at the POS. Stock is checked when that sale is
 * completed, exactly like any other held bill.
 */
export async function convertQuotationAction(
  quotationId: string
): Promise<ConvertQuotationResult> {
  const user = await getActionUser();

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const held = await prisma.$transaction(async (tx) => {
        const quote = await tx.quotation.findUnique({
          where: { id: quotationId },
          include: { items: true },
        });
        if (!quote) throw new SaleValidationError("That quotation no longer exists.");
        if (quote.status !== "OPEN") {
          throw new SaleValidationError(
            `${quote.quoteNo} is already ${quote.status.toLowerCase()}.`
          );
        }

        const products = await tx.product.findMany({
          where: { id: { in: quote.items.map((i) => i.productId) } },
          select: { id: true, isActive: true, name: true },
        });
        const inactive = products.filter((p) => !p.isActive);
        if (inactive.length > 0) {
          throw new SaleValidationError(
            `No longer sold: ${inactive.map((p) => p.name).join(", ")}. Edit the cart after recalling, or make a new quotation.`
          );
        }

        const sale = await tx.sale.create({
          data: {
            invoiceNo: await buildInvoiceNo(tx),
            customerId: quote.customerId,
            userId: user.id,
            status: "HELD",
            subtotal: quote.subtotal,
            discountAmount: quote.discountAmount,
            taxAmount: quote.taxAmount,
            total: quote.total,
            paidAmount: 0,
            changeAmount: 0,
            note:
              [`From ${quote.quoteNo}`, quote.customerName, quote.note]
                .filter(Boolean)
                .join(" · ") || null,
            items: {
              create: quote.items.map((item) => ({
                productId: item.productId,
                productName: item.productName,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                discount: item.discount,
                lineTotal: item.lineTotal,
              })),
            },
          },
        });

        await tx.quotation.update({
          where: { id: quote.id },
          data: { status: "CONVERTED", saleId: sale.id },
        });

        await recordAudit(
          {
            userId: user.id,
            action: "quotation.convert",
            entityType: "Quotation",
            entityId: quote.id,
            summary: `${quote.quoteNo} (${toNum(quote.total)}) → held bill ${sale.invoiceNo}`,
            details: { quoteNo: quote.quoteNo, invoiceNo: sale.invoiceNo },
          },
          tx
        );

        return sale;
      });

      revalidatePath("/quotations");
      revalidatePath(`/quotations/${quotationId}`);
      revalidatePath("/pos");
      revalidatePath("/sales");
      return { heldSaleId: held.id };
    } catch (error) {
      if (error instanceof SaleValidationError) return { error: error.message };
      if (isUniqueViolation(error) && attempt < 2) continue;
      console.error("convertQuotation failed:", error);
      return { error: "Failed to convert the quotation. Please try again." };
    }
  }
  return { error: "Failed to generate an invoice number. Please try again." };
}

export async function cancelQuotationAction(formData: FormData): Promise<void> {
  const user = await getActionUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const quote = await prisma.quotation.findFirst({
    where: { id, status: "OPEN" },
  });
  if (!quote) return;

  await prisma.quotation.update({
    where: { id },
    data: { status: "CANCELLED" },
  });
  await recordAudit({
    userId: user.id,
    action: "quotation.cancel",
    entityType: "Quotation",
    entityId: id,
    summary: `Cancelled ${quote.quoteNo} (${toNum(quote.total)})`,
  });

  revalidatePath("/quotations");
  revalidatePath(`/quotations/${id}`);
}
