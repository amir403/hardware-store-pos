"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/app/lib/prisma";
import { getActionUser, hasRole } from "@/app/lib/auth";
import { round2, round3, toNum } from "@/app/lib/format";
import { recordAudit } from "@/app/lib/audit";
import { returnCredit } from "@/app/lib/sale-pricing";

export type CreatePurchaseInput = z.input<typeof createPurchaseSchema>;

export type CreatePurchaseResult =
  | { purchaseId: string }
  | { error: string };

const createPurchaseSchema = z.object({
  supplierId: z
    .string()
    .nullable()
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
  referenceNo: z
    .string()
    .trim()
    .max(60)
    .nullable()
    .optional()
    .transform((v) => (v && v !== "" ? v : null)),
  note: z
    .string()
    .trim()
    .max(300)
    .nullable()
    .optional()
    .transform((v) => (v && v !== "" ? v : null)),
  updateCost: z.boolean().default(true),
  /** Paid to the supplier now. Left out = paid in full. */
  paidAmount: z.number().min(0).max(99_999_999).nullable().optional(),
  /** <input type="date"> value; only kept while a balance is left unpaid. */
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Due date must be a real date.")
    .nullable()
    .optional()
    .transform((v) => (v ? new Date(`${v}T23:59:59`) : null)),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().positive().max(9_999_999),
        unitCost: z.number().min(0).max(99_999_999),
      })
    )
    .min(1, "Add at least one product"),
});

export async function createPurchaseAction(
  input: CreatePurchaseInput
): Promise<CreatePurchaseResult> {
  const user = await getActionUser();
  if (!hasRole(user, "ADMIN", "MANAGER")) {
    return { error: "You are not allowed to record purchases." };
  }

  const parsed = createPurchaseSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid purchase data.",
    };
  }

  const data = parsed.data;

  try {
    const purchase = await prisma.$transaction(async (tx) => {
      const products = await tx.product.findMany({
        where: { id: { in: data.items.map((i) => i.productId) } },
      });
      const productMap = new Map(products.map((p) => [p.id, p]));

      for (const item of data.items) {
        if (!productMap.has(item.productId)) {
          throw new Error("One of the products no longer exists.");
        }
      }

      let subtotal = 0;
      const lineData = data.items.map((item) => {
        const lineTotal = round2(item.quantity * item.unitCost);
        subtotal = round2(subtotal + lineTotal);
        return {
          productId: item.productId,
          quantity: round3(item.quantity),
          unitCost: round2(item.unitCost),
          lineTotal,
          trackStock: productMap.get(item.productId)!.trackStock,
        };
      });

      // Paying less than the total leaves the rest on the supplier's account.
      // Without a supplier there is no account to owe, so it must be settled.
      const paidAmount = round2(
        Math.min(data.paidAmount ?? subtotal, subtotal)
      );
      const balanceDue = round2(subtotal - paidAmount);
      if (balanceDue > 0 && !data.supplierId) {
        throw new Error("Choose a supplier before leaving a balance unpaid.");
      }

      const created = await tx.purchase.create({
        data: {
          supplierId: data.supplierId,
          userId: user.id,
          referenceNo: data.referenceNo,
          note: data.note,
          subtotal,
          taxAmount: 0,
          total: subtotal,
          paidAmount,
          dueDate: balanceDue > 0 ? data.dueDate : null,
          items: {
            create: lineData.map((line) => ({
              productId: line.productId,
              quantity: line.quantity,
              unitCost: line.unitCost,
              lineTotal: line.lineTotal,
            })),
          },
        },
      });

      for (const line of lineData) {
        if (line.trackStock) {
          await tx.product.update({
            where: { id: line.productId },
            data: { stockQty: { increment: line.quantity } },
          });
          await tx.stockMovement.create({
            data: {
              productId: line.productId,
              type: "PURCHASE",
              quantityChange: line.quantity,
              purchaseId: created.id,
              userId: user.id,
              reason: `Purchase ${data.referenceNo ?? created.id.slice(0, 8)}`,
            },
          });
        }
        if (data.updateCost && line.unitCost > 0) {
          await tx.product.update({
            where: { id: line.productId },
            data: { costPrice: line.unitCost },
          });
        }
      }

      return created;
    });

    revalidatePath("/purchases");
    revalidatePath("/inventory");
    revalidatePath("/products");
    revalidatePath("/suppliers");
    if (data.supplierId) revalidatePath(`/suppliers/${data.supplierId}`);
    revalidatePath("/");

    return { purchaseId: purchase.id };
  } catch (error) {
    console.error("createPurchase failed:", error);
    return {
      error:
        error instanceof Error && error.message !== ""
          ? error.message
          : "Failed to record the purchase.",
    };
  }
}

export type ReturnToSupplierResult = { ok: true } | { error: string };

const returnToSupplierSchema = z.object({
  purchaseId: z.string().min(1),
  items: z
    .array(
      z.object({
        purchaseItemId: z.string().min(1),
        quantity: z.number().positive().max(9_999_999),
      })
    )
    .min(1, "Choose at least one item to send back."),
  reason: z
    .string()
    .trim()
    .max(300)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null)),
});

/**
 * Send goods from a purchase back to the supplier. Stock goes down, and the
 * value (at the cost paid) comes off what we owe them — or, if the purchase
 * was already paid, sits with them as an advance. The purchase is never
 * edited; returning everything is how a wrong purchase is undone.
 */
export async function returnToSupplierAction(
  input: z.input<typeof returnToSupplierSchema>
): Promise<ReturnToSupplierResult> {
  const user = await getActionUser();
  if (!hasRole(user, "ADMIN", "MANAGER")) {
    return { error: "You are not allowed to return stock to suppliers." };
  }

  const parsed = returnToSupplierSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid return." };
  }
  const data = parsed.data;

  try {
    const supplierId = await prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.findUnique({
        where: { id: data.purchaseId },
        include: {
          items: {
            include: {
              product: { select: { name: true, trackStock: true, stockQty: true } },
              returnItems: { select: { quantity: true, amount: true } },
            },
          },
        },
      });
      if (!purchase) throw new Error("That purchase no longer exists.");

      const itemMap = new Map(purchase.items.map((item) => [item.id, item]));
      const lines: {
        purchaseItemId: string;
        productId: string;
        name: string;
        quantity: number;
        amount: number;
        trackStock: boolean;
      }[] = [];

      for (const requested of data.items) {
        const item = itemMap.get(requested.purchaseItemId);
        if (!item) throw new Error("That item is not on this purchase.");
        if (lines.some((l) => l.purchaseItemId === item.id)) {
          throw new Error(`"${item.product.name}" is listed twice.`);
        }

        const bought = toNum(item.quantity);
        const remaining = round3(
          bought - item.returnItems.reduce((sum, r) => sum + toNum(r.quantity), 0)
        );
        const quantity = round3(requested.quantity);
        if (quantity > remaining) {
          throw new Error(`Only ${remaining} of "${item.product.name}" can still go back.`);
        }
        // Stock cannot go below zero: what has already been sold cannot be returned.
        if (item.product.trackStock && quantity > toNum(item.product.stockQty)) {
          throw new Error(
            `Only ${toNum(item.product.stockQty)} of "${item.product.name}" is in stock to send back.`
          );
        }

        lines.push({
          purchaseItemId: item.id,
          productId: item.productId,
          name: item.product.name,
          quantity,
          amount: returnCredit({
            lineValue: toNum(item.lineTotal),
            soldQty: bought,
            creditedSoFar: item.returnItems.reduce((sum, r) => sum + toNum(r.amount), 0),
            quantity,
            remaining,
          }),
          trackStock: item.product.trackStock,
        });
      }

      const amount = round2(lines.reduce((sum, l) => sum + l.amount, 0));
      const ret = await tx.purchaseReturn.create({
        data: {
          purchaseId: purchase.id,
          userId: user.id,
          amount,
          reason: data.reason,
          items: {
            create: lines.map((l) => ({
              purchaseItemId: l.purchaseItemId,
              productId: l.productId,
              quantity: l.quantity,
              amount: l.amount,
            })),
          },
        },
      });

      for (const line of lines) {
        if (!line.trackStock) continue;
        await tx.product.update({
          where: { id: line.productId },
          data: { stockQty: { decrement: line.quantity } },
        });
        await tx.stockMovement.create({
          data: {
            productId: line.productId,
            type: "SUPPLIER_RETURN",
            quantityChange: -line.quantity,
            purchaseId: purchase.id,
            userId: user.id,
            reason: `Returned to supplier${data.reason ? `: ${data.reason}` : ""}`,
          },
        });
      }

      await recordAudit(
        {
          userId: user.id,
          action: "purchase.return",
          entityType: "Purchase",
          entityId: purchase.id,
          summary: `${amount} sent back (${lines.map((l) => `${l.quantity} × ${l.name}`).join(", ")})`,
          details: { returnId: ret.id, amount, reason: data.reason },
        },
        tx
      );

      return purchase.supplierId;
    });

    revalidatePath("/purchases");
    revalidatePath(`/purchases/${data.purchaseId}`);
    revalidatePath("/suppliers");
    if (supplierId) revalidatePath(`/suppliers/${supplierId}`);
    revalidatePath("/inventory");
    revalidatePath("/products");
    revalidatePath("/");
    return { ok: true };
  } catch (error) {
    console.error("returnToSupplier failed:", error);
    return {
      error:
        error instanceof Error && error.message
          ? error.message
          : "Failed to record the return.",
    };
  }
}
