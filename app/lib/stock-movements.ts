import type { StockMovementType } from "@/app/generated/prisma/client";

/** Label and badge colour for each kind of stock movement (inventory log, product page). */
export const MOVEMENT_TYPES: Record<StockMovementType, { label: string; style: string }> = {
  SALE: { label: "Sale", style: "bg-blue-50 text-blue-700" },
  PURCHASE: { label: "Purchase", style: "bg-emerald-50 text-emerald-700" },
  RETURN: { label: "Return", style: "bg-violet-50 text-violet-700" },
  ADJUSTMENT: { label: "Adjustment", style: "bg-amber-50 text-amber-700" },
  DAMAGE: { label: "Damage", style: "bg-red-50 text-red-700" },
  SUPPLIER_RETURN: { label: "To supplier", style: "bg-orange-50 text-orange-700" },
};
