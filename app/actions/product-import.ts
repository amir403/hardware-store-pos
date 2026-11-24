"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/app/lib/prisma";
import { getActionUser, hasRole } from "@/app/lib/auth";
import { recordAudit } from "@/app/lib/audit";
import { readImportFile, type ImportRow } from "@/app/lib/product-import";

export type PlannedRow = {
  line: number;
  name: string;
  status: "new" | "update" | "error";
  errors: string[];
  price?: number;
  stockQty?: number;
};

export type ImportResult =
  | { error: string }
  | { rows: PlannedRow[]; created?: number; updated?: number; done?: boolean };

const MAX_FILE_CHARS = 3_000_000;

type Plan = {
  rows: PlannedRow[];
  work: { row: ImportRow; existingId: string | null }[];
};

/** Reads the file and decides per line: new product, update of one matched by SKU or barcode, or error. */
async function planImport(text: string, client: Prisma.TransactionClient | typeof prisma): Promise<Plan | { error: string }> {
  if (text.length > MAX_FILE_CHARS) return { error: "The file is too large. Split it into smaller files." };
  const file = readImportFile(text);
  if (file.error) return { error: file.error };

  const valid = file.rows.filter((r) => r.row);
  const skus = valid.map((r) => r.row!.sku).filter((v): v is string => Boolean(v));
  const barcodes = valid.map((r) => r.row!.barcode).filter((v): v is string => Boolean(v));
  const existing = skus.length + barcodes.length
    ? await client.product.findMany({
        where: { OR: [{ sku: { in: skus } }, { barcode: { in: barcodes } }] },
        select: { id: true, sku: true, barcode: true, name: true },
      })
    : [];
  const bySku = new Map(existing.filter((p) => p.sku).map((p) => [p.sku!, p]));
  const byBarcode = new Map(existing.filter((p) => p.barcode).map((p) => [p.barcode!, p]));

  const rows: PlannedRow[] = [];
  const work: Plan["work"] = [];
  for (const checked of file.rows) {
    const errors = [...checked.errors];
    const row = checked.row;
    let existingId: string | null = null;
    if (row) {
      const match = (row.sku && bySku.get(row.sku)) || (row.barcode && byBarcode.get(row.barcode)) || null;
      existingId = match ? match.id : null;
      // SKU and barcode must point at the same product (or at none): a line
      // whose barcode is on one product and SKU on another is a mistake, not an update.
      const owner = row.barcode ? byBarcode.get(row.barcode) : undefined;
      if (owner && owner.id !== existingId) errors.push(`Barcode ${row.barcode} already belongs to "${owner.name}"`);
      const skuOwner = row.sku ? bySku.get(row.sku) : undefined;
      if (skuOwner && skuOwner.id !== existingId) errors.push(`SKU ${row.sku} already belongs to "${skuOwner.name}"`);
      if (match && row.sku && match.sku && match.sku !== row.sku) {
        errors.push(`Barcode ${row.barcode} belongs to "${match.name}", whose SKU is ${match.sku}, not ${row.sku}`);
      }
    }
    const ok = row && errors.length === 0;
    rows.push({
      line: checked.line,
      name: checked.name,
      status: ok ? (existingId ? "update" : "new") : "error",
      errors,
      price: row?.price,
      stockQty: row ? (row.stockQty ?? 0) : undefined,
    });
    if (ok) work.push({ row, existingId });
  }
  return { rows, work };
}

async function requireManager() {
  const user = await getActionUser();
  return hasRole(user, "ADMIN", "MANAGER") ? user : null;
}

/** Dry run for the preview: nothing is written. */
export async function previewImportAction(text: string): Promise<ImportResult> {
  if (!(await requireManager())) return { error: "Only an admin or manager can import products." };
  const plan = await planImport(text, prisma);
  return "error" in plan ? plan : { rows: plan.rows };
}

/**
 * Writes the lines that passed. New products get their opening stock as an
 * ADJUSTMENT movement; matched products get names, prices and the columns the
 * file has, but never a stock change (that is what purchases and counts are for).
 */
export async function runImportAction(text: string): Promise<ImportResult> {
  const user = await requireManager();
  if (!user) return { error: "Only an admin or manager can import products." };

  let result: ImportResult;
  try {
    result = await importInTransaction(text, user.id);
  } catch (error) {
    console.error("product import failed:", error);
    return { error: "The import failed and nothing was saved. Check the file and try again." };
  }

  if (!("error" in result)) {
    for (const path of ["/products", "/pos", "/inventory", "/labels", "/"]) revalidatePath(path);
  }
  return result;
}

/** All or nothing: a failure part-way leaves the catalog as it was. */
async function importInTransaction(text: string, userId: string): Promise<ImportResult> {
  const user = { id: userId };
  return prisma.$transaction(
    async (tx) => {
      const plan = await planImport(text, tx);
      if ("error" in plan) return plan;

      // Categories by name, created when missing (matched ignoring case).
      const names = [...new Set(plan.work.map((w) => w.row.category).filter((c): c is string => Boolean(c)))];
      const categoryId = new Map<string, string>();
      for (const name of names) {
        const found = await tx.category.findFirst({ where: { name: { equals: name, mode: "insensitive" } }, select: { id: true } });
        const id = found?.id ?? (await tx.category.create({ data: { name }, select: { id: true } })).id;
        categoryId.set(name.toLowerCase(), id);
      }
      const catOf = (row: ImportRow) => (row.category ? categoryId.get(row.category.toLowerCase())! : null);

      const fresh = plan.work.filter((w) => !w.existingId);
      const created = await tx.product.createManyAndReturn({
        data: fresh.map(({ row }) => ({
          name: row.name,
          sku: row.sku,
          barcode: row.barcode,
          unit: row.unit ?? "pcs",
          costPrice: row.costPrice,
          price: row.price,
          wholesalePrice: row.wholesalePrice,
          taxRate: row.taxRate ?? 0,
          stockQty: row.stockQty ?? 0,
          reorderLevel: row.reorderLevel,
          categoryId: catOf(row),
        })),
        select: { id: true, stockQty: true },
      });
      const opening = created.filter((p) => Number(p.stockQty) > 0);
      if (opening.length > 0) {
        await tx.stockMovement.createMany({
          data: opening.map((p) => ({
            productId: p.id,
            type: "ADJUSTMENT" as const,
            quantityChange: p.stockQty,
            reason: "Opening stock (import)",
            userId: user.id,
          })),
        });
      }

      const updates = plan.work.filter((w) => w.existingId);
      // Blank cells leave the product's value alone; stock never changes here.
      for (const { row, existingId } of updates) {
        const given = Object.fromEntries(
          (["sku", "barcode", "unit", "costPrice", "wholesalePrice", "taxRate", "reorderLevel"] as const)
            .filter((key) => row[key] !== null)
            .map((key) => [key, row[key]])
        );
        await tx.product.update({
          where: { id: existingId! },
          data: {
            name: row.name,
            price: row.price,
            ...given,
            ...(row.category ? { categoryId: catOf(row) } : {}),
          },
        });
      }

      const skipped = plan.rows.filter((r) => r.status === "error").length;
      await recordAudit(
        {
          userId: user.id,
          action: "product.import",
          entityType: "Product",
          summary: `Imported ${created.length} new, updated ${updates.length}${skipped ? `, skipped ${skipped} lines with errors` : ""}`,
          details: { created: created.length, updated: updates.length, skippedLines: plan.rows.filter((r) => r.status === "error").map((r) => r.line) },
        },
        tx
      );
      return { rows: plan.rows, created: created.length, updated: updates.length, done: true };
    },
    { timeout: 120_000 }
  );
}
