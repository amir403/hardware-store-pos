// Client-safe: shared by the label picker and the printed sheet.

/** Most labels one product can ask for, and most on one printed sheet. */
export const MAX_PER_PRODUCT = 100;
export const MAX_LABELS = 480;

/** Units sold as whole items, where one label per piece makes sense. */
const COUNTED_UNITS = new Set(["pcs", "box"]);

/**
 * How many labels to suggest for a product when it is ticked: one per piece
 * for counted units (stock on hand, or the quantity just received), but a
 * single shelf label for things sold by length, weight or volume — 500 yards
 * of cable wants one label, not 500.
 */
export function defaultLabelCount(unit: string, quantity: number): number {
  if (!COUNTED_UNITS.has(unit)) return 1;
  return Math.min(MAX_PER_PRODUCT, Math.max(1, Math.floor(quantity)));
}

/** `id:count` pairs as the sheet URL carries them (`?l=abc:3&l=def:1`). */
export function encodeLabelItem(id: string, count: number): string {
  return `${id}:${count}`;
}

/**
 * Reads the sheet URL back into products and counts: unknown shapes are
 * dropped, counts are clamped to 1..MAX_PER_PRODUCT, a repeated id keeps its
 * first count.
 */
export function parseLabelItems(raw: string | string[] | undefined): { id: string; count: number }[] {
  const seen = new Set<string>();
  const items: { id: string; count: number }[] = [];
  for (const entry of raw === undefined ? [] : [raw].flat()) {
    const match = /^([A-Za-z0-9_-]+):(\d+)$/.exec(entry);
    if (!match || seen.has(match[1])) continue;
    seen.add(match[1]);
    items.push({ id: match[1], count: Math.min(MAX_PER_PRODUCT, Math.max(1, Number(match[2]))) });
  }
  return items;
}
