"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/app/lib/prisma";
import { getActionUser, hasRole } from "@/app/lib/auth";
import { recordAudit } from "@/app/lib/audit";
import { round2, round3, toNum } from "@/app/lib/format";
import { designName, variantLabel, type VariantFields } from "@/app/lib/variants";

export type GroupResult = { ok?: true; error?: string };

const nameField = z.string().trim().min(1, "Enter a name.").max(80);
const money = z.coerce.number().min(0.01, "Price must be greater than 0").max(99_999_999);
const optionalText = (max: number) =>
  z.string().trim().max(max).optional().transform((v) => v || null);
// Design, size and colour are each optional, but a design needs at least one.
const variantShape = { variantName: optionalText(80), size: optionalText(40), color: optionalText(40) };
const hasVariant = (v: VariantFields) => variantLabel(v) !== "";
const variantMessage = { message: "Enter a design, size or colour." };

async function requireManager() {
  const user = await getActionUser();
  if (!hasRole(user, "ADMIN", "MANAGER")) throw new Error("Only managers and admins can manage designs.");
  return user;
}

function revalidateProducts() {
  revalidatePath("/products", "layout");
  revalidatePath("/pos");
  revalidatePath("/labels");
  revalidatePath("/inventory");
}

/** Turn a single product into the first design of a new group. */
export async function makeGroupAction(_prev: GroupResult, formData: FormData): Promise<GroupResult> {
  await requireManager();
  const parsed = z
    .object({ productId: z.string().min(1), groupName: nameField, ...variantShape })
    .refine(hasVariant, variantMessage)
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { productId, groupName, ...variant } = parsed.data;

  await prisma.$transaction(async (tx) => {
    const group = await tx.productGroup.create({ data: { name: groupName } });
    await tx.product.update({
      where: { id: productId },
      data: { groupId: group.id, ...variant, name: designName(groupName, variant) },
    });
  });
  revalidateProducts();
  return { ok: true };
}

/** Put an existing product into an existing group as one more design. */
export async function joinGroupAction(_prev: GroupResult, formData: FormData): Promise<GroupResult> {
  await requireManager();
  const parsed = z
    .object({ productId: z.string().min(1), groupId: z.string().min(1, "Choose a group."), ...variantShape })
    .refine(hasVariant, variantMessage)
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { productId, groupId, ...variant } = parsed.data;

  const group = await prisma.productGroup.findUnique({ where: { id: groupId } });
  if (!group) return { error: "That group no longer exists." };
  await prisma.product.update({
    where: { id: productId },
    data: { groupId, ...variant, name: designName(group.name, variant) },
  });
  revalidateProducts();
  return { ok: true };
}

/**
 * Add a new design to a group, copying everything from `templateId` (category,
 * unit, cost, prices, tax, reorder level) so only what differs is typed in.
 */
export async function addDesignAction(_prev: GroupResult, formData: FormData): Promise<GroupResult> {
  const user = await requireManager();
  const parsed = z
    .object({
      templateId: z.string().min(1),
      ...variantShape,
      barcode: z.string().trim().max(60).transform((v) => v || null),
      sku: z.string().trim().max(40).transform((v) => v || null),
      price: money,
      stockQty: z.coerce.number().min(0).max(9_999_999).default(0),
    })
    .refine(hasVariant, variantMessage)
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const data = parsed.data;

  const template = await prisma.product.findUnique({
    where: { id: data.templateId },
    include: { group: true },
  });
  if (!template?.group) return { error: "That group no longer exists." };

  if (data.barcode && (await prisma.product.findUnique({ where: { barcode: data.barcode } }))) {
    return { error: "A product with this barcode already exists." };
  }
  if (data.sku && (await prisma.product.findUnique({ where: { sku: data.sku } }))) {
    return { error: "A product with this SKU already exists." };
  }

  const stockQty = template.trackStock ? round3(data.stockQty) : 0;
  await prisma.$transaction(async (tx) => {
    const created = await tx.product.create({
      data: {
        name: designName(template.group!.name, data),
        variantName: data.variantName,
        size: data.size,
        color: data.color,
        groupId: template.group!.id,
        sku: data.sku,
        barcode: data.barcode,
        description: template.description,
        unit: template.unit,
        costPrice: template.costPrice,
        price: round2(data.price),
        wholesalePrice: template.wholesalePrice,
        taxRate: template.taxRate,
        stockQty,
        reorderLevel: template.reorderLevel,
        trackStock: template.trackStock,
        categoryId: template.categoryId,
      },
    });
    // Opening stock goes on the books like any other count.
    if (stockQty > 0) {
      await tx.stockMovement.create({
        data: {
          productId: created.id,
          type: "ADJUSTMENT",
          quantityChange: stockQty,
          reason: "Opening stock (new design)",
          userId: user.id,
        },
      });
    }
  });
  revalidateProducts();
  return { ok: true };
}

/**
 * Rename the group and/or this design. Every design's full name is rebuilt so
 * "Old Name – Flower" never lingers on the others.
 */
export async function renameDesignAction(_prev: GroupResult, formData: FormData): Promise<GroupResult> {
  await requireManager();
  const parsed = z
    .object({ productId: z.string().min(1), groupName: nameField, ...variantShape })
    .refine(hasVariant, variantMessage)
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { productId, groupName, ...variant } = parsed.data;

  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { group: { include: { products: true } } },
  });
  if (!product?.group) return { error: "That group no longer exists." };
  const group = product.group;

  await prisma.$transaction(async (tx) => {
    await tx.productGroup.update({ where: { id: group.id }, data: { name: groupName } });
    for (const design of group.products) {
      const fields = design.id === productId ? variant : design;
      await tx.product.update({
        where: { id: design.id },
        data: {
          ...(design.id === productId ? variant : {}),
          name: designName(groupName, fields),
        },
      });
    }
  });
  revalidateProducts();
  return { ok: true };
}

/** One price for every design in the group; wholesale too when given. */
export async function setGroupPriceAction(_prev: GroupResult, formData: FormData): Promise<GroupResult> {
  const user = await requireManager();
  const parsed = z
    .object({
      groupId: z.string().min(1),
      price: money,
      wholesalePrice: z
        .union([z.literal(""), z.coerce.number().min(0.01).max(99_999_999)])
        .transform((v) => (v === "" ? null : v)),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { groupId, price, wholesalePrice } = parsed.data;

  const group = await prisma.productGroup.findUnique({
    where: { id: groupId },
    include: { products: { select: { price: true } } },
  });
  if (!group) return { error: "That group no longer exists." };

  await prisma.$transaction(async (tx) => {
    await tx.product.updateMany({
      where: { groupId },
      data: { price: round2(price), ...(wholesalePrice !== null ? { wholesalePrice: round2(wholesalePrice) } : {}) },
    });
    await recordAudit(
      {
        userId: user.id,
        action: "product.price",
        entityType: "ProductGroup",
        entityId: groupId,
        summary: `${group.name}: all ${group.products.length} designs set to ${round2(price)}${
          wholesalePrice !== null ? ` (wholesale ${round2(wholesalePrice)})` : ""
        }`,
        details: {
          before: group.products.map((p) => toNum(p.price)),
          price: round2(price),
          wholesalePrice,
        },
      },
      tx
    );
  });
  revalidateProducts();
  return { ok: true };
}

/**
 * Take one design out of its group under a name of its own (it no longer
 * belongs to "Group – Design"); an emptied group is removed.
 */
export async function leaveGroupAction(formData: FormData): Promise<void> {
  await requireManager();
  const productId = String(formData.get("productId") ?? "");
  const name = z.string().trim().min(1).max(120).safeParse(formData.get("name"));
  if (!name.success) throw new Error("Enter a name for the product.");
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { groupId: true } });
  if (!product?.groupId) return;

  await prisma.$transaction(async (tx) => {
    await tx.product.update({
      where: { id: productId },
      data: { name: name.data, groupId: null, variantName: null, size: null, color: null },
    });
    if ((await tx.product.count({ where: { groupId: product.groupId } })) === 0) {
      await tx.productGroup.delete({ where: { id: product.groupId! } });
    }
  });
  revalidateProducts();
}
