"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/app/lib/prisma";
import { getActionUser, hasRole } from "@/app/lib/auth";
import { round3 } from "@/app/lib/format";
import { recordAudit } from "@/app/lib/audit";

const adjustSchema = z.object({
  productId: z.string().min(1, "Select a product"),
  newQty: z.coerce.number().min(0).max(9_999_999),
  reason: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => (v && v !== "" ? v : "Manual adjustment")),
});

export async function adjustStockAction(formData: FormData) {
  const user = await getActionUser();
  if (!hasRole(user, "ADMIN", "MANAGER")) {
    throw new Error("Unauthorized");
  }

  const parsed = adjustSchema.safeParse({
    productId: formData.get("productId"),
    newQty: formData.get("newQty"),
    reason: formData.get("reason") ?? "",
  });

  if (!parsed.success) return;

  const { productId, newQty, reason } = parsed.data;

  await prisma.$transaction(async (tx) => {
    const product = await tx.product.findUnique({ where: { id: productId } });
    if (!product || !product.trackStock) return;

    const current = Number(product.stockQty.toString());
    const change = round3(newQty - current);
    if (change === 0) return;

    await tx.product.update({
      where: { id: productId },
      data: { stockQty: newQty },
    });

    await tx.stockMovement.create({
      data: {
        productId,
        type: "ADJUSTMENT",
        quantityChange: change,
        reason,
        userId: user.id,
      },
    });

    await recordAudit(
      {
        userId: user.id,
        action: "stock.adjust",
        entityType: "Product",
        entityId: productId,
        summary: `${product.name}: ${current} → ${newQty} ${product.unit} (${reason})`,
        details: { from: current, to: newQty, change, reason },
      },
      tx
    );
  });

  revalidatePath("/inventory");
  revalidatePath("/products");
  revalidatePath("/");
}

/**
 * Apply a whole stock count at once. The form posts `count:<productId>` for
 * every row; blank rows were not counted and are left alone. Each difference
 * becomes an ADJUSTMENT movement, and the count is one audit entry.
 */
export async function stockCountAction(formData: FormData) {
  const user = await getActionUser();
  if (!hasRole(user, "ADMIN", "MANAGER")) {
    throw new Error("Only managers and admins can apply a stock count.");
  }

  const counted = new Map<string, number>();
  for (const [key, raw] of formData.entries()) {
    if (!key.startsWith("count:") || String(raw).trim() === "") continue;
    const qty = Number(String(raw).replace(/,/g, ""));
    if (!Number.isFinite(qty) || qty < 0 || qty > 9_999_999) {
      throw new Error("Counted quantities must be zero or more.");
    }
    counted.set(key.slice("count:".length), round3(qty));
  }
  if (counted.size === 0) throw new Error("Enter at least one counted quantity.");

  await prisma.$transaction(async (tx) => {
    const products = await tx.product.findMany({
      where: { id: { in: [...counted.keys()] }, trackStock: true },
      select: { id: true, name: true, unit: true, stockQty: true },
    });

    const changes: { name: string; from: number; to: number }[] = [];
    for (const product of products) {
      const to = counted.get(product.id)!;
      const from = Number(product.stockQty.toString());
      const change = round3(to - from);
      if (change === 0) continue;
      await tx.product.update({ where: { id: product.id }, data: { stockQty: to } });
      await tx.stockMovement.create({
        data: {
          productId: product.id,
          type: "ADJUSTMENT",
          quantityChange: change,
          reason: "Stock count",
          userId: user.id,
        },
      });
      changes.push({ name: product.name, from, to });
    }

    if (changes.length > 0) {
      await recordAudit(
        {
          userId: user.id,
          action: "stock.count",
          entityType: "Product",
          summary: `Stock count: ${changes.length} of ${counted.size} counted item(s) corrected`,
          details: { changes },
        },
        tx
      );
    }
  });

  revalidatePath("/inventory");
  revalidatePath("/inventory/count");
  revalidatePath("/products");
  revalidatePath("/pos");
  revalidatePath("/");
}
