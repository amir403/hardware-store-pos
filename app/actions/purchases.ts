"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/app/lib/prisma";
import { getActionUser, hasRole } from "@/app/lib/auth";
import { round2, round3 } from "@/app/lib/format";

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
