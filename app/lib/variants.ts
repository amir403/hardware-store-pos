// Client-safe helpers for product groups (designs of one item).

/** The full product name a design is sold and searched under. */
export function designName(groupName: string, variantName: string): string {
  return `${groupName.trim()} – ${variantName.trim()}`;
}

export type GridEntry<P> =
  | { kind: "product"; product: P }
  | { kind: "group"; groupId: string; name: string; designs: P[] };

/**
 * Fold designs of the same group into one tile, placed where the group's first
 * design would have appeared, so the grid keeps its order (alphabetical, etc.).
 */
export function groupForGrid<P extends { groupId: string | null; groupName: string | null }>(
  products: P[]
): GridEntry<P>[] {
  const entries: GridEntry<P>[] = [];
  const groups = new Map<string, Extract<GridEntry<P>, { kind: "group" }>>();
  for (const product of products) {
    if (!product.groupId) {
      entries.push({ kind: "product", product });
      continue;
    }
    const existing = groups.get(product.groupId);
    if (existing) {
      existing.designs.push(product);
    } else {
      const entry = {
        kind: "group" as const,
        groupId: product.groupId,
        name: product.groupName ?? "",
        designs: [product],
      };
      groups.set(product.groupId, entry);
      entries.push(entry);
    }
  }
  return entries;
}
