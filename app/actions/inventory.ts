"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/app/lib/prisma";
import { getActionUser, hasRole } from "@/app/lib/auth";
import { round3 } from "@/app/lib/format";

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
  });

  revalidatePath("/inventory");
  revalidatePath("/products");
  revalidatePath("/");
}
