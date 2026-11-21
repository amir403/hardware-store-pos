"use client";

import Link from "next/link";
import { useMemo, useRef, useState, type MouseEvent } from "react";
import { MinusIcon, PlusIcon, PrinterIcon, SearchIcon, XIcon } from "lucide-react";
import { LabelFace } from "@/app/components/label-face";
import { LABEL_SIZES, type LabelSize } from "@/app/lib/print-formats";
import { formatQty } from "@/app/lib/format";
import {
  MAX_LABELS,
  MAX_PER_PRODUCT,
  defaultLabelCount,
  encodeLabelItem,
} from "@/app/lib/labels";

export type LabelProduct = {
  id: string;
  name: string;
  categoryId: string | null;
  categoryName: string | null;
  sku: string | null;
  barcode: string | null;
  /** What the label encodes (barcode, else SKU); null when it cannot print. */
  code: string | null;
  price: string;
  unit: string;
  stockQty: number;
  trackStock: boolean;
};

/** Rows drawn at once; typing narrows the list long before this matters. */
const VISIBLE_LIMIT = 200;
/** Each product adds ~35 characters to the sheet URL; stay under server header limits. */
const MAX_ITEMS = 300;

export function LabelPicker({
  products,
  categories,
  initialSize,
  initialSelection,
  notice,
}: {
  products: LabelProduct[];
  categories: { id: string; name: string }[];
  initialSize: LabelSize;
  initialSelection: [string, number][];
  notice?: string;
}) {
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [size, setSize] = useState<LabelSize>(initialSize);
  // Insertion order is the order items were ticked; searching never clears it.
  const [selected, setSelected] = useState(() => new Map(initialSelection));
  const [scanNote, setScanNote] = useState("");
  const lastClicked = useRef<string | null>(null);

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return products
      .filter((p) => !categoryId || p.categoryId === categoryId)
      .filter(
        (p) =>
          !needle ||
          p.name.toLowerCase().includes(needle) ||
          p.sku?.toLowerCase().includes(needle) ||
          p.barcode?.toLowerCase().includes(needle)
      )
      // Products that cannot print sink to the bottom.
      .sort((a, b) => Number(!a.code) - Number(!b.code));
  }, [products, query, categoryId]);
  const visible = matches.slice(0, VISIBLE_LIMIT);
  const printable = visible.filter((p) => p.code);

  const suggested = (p: LabelProduct) => defaultLabelCount(p.unit, p.trackStock ? p.stockQty : 1);

  function update(change: (next: Map<string, number>) => void) {
    setSelected((current) => {
      const next = new Map(current);
      change(next);
      return next;
    });
  }

  function toggle(product: LabelProduct, shiftKey: boolean) {
    if (!product.code) return;
    const on = !selected.has(product.id);
    const anchor = shiftKey && lastClicked.current ? printable.findIndex((p) => p.id === lastClicked.current) : -1;
    const here = printable.findIndex((p) => p.id === product.id);
    // Shift-click gives every printable row between the two clicks the new state.
    const range =
      anchor >= 0 && here >= 0
        ? printable.slice(Math.min(anchor, here), Math.max(anchor, here) + 1)
        : [product];
    update((next) => {
      for (const p of range) {
        if (!on) next.delete(p.id);
        else if (!next.has(p.id)) next.set(p.id, suggested(p));
      }
    });
    lastClicked.current = product.id;
  }

  function setCount(id: string, value: number) {
    if (!Number.isFinite(value)) return;
    update((next) => next.set(id, Math.min(MAX_PER_PRODUCT, Math.max(1, Math.round(value)))));
  }

  // A barcode reader types the code then Enter: tick that product (or add one label).
  function onSearchEnter() {
    const code = query.trim().toLowerCase();
    if (!code) return;
    const hit = products.find(
      (p) => p.code && (p.barcode?.toLowerCase() === code || p.sku?.toLowerCase() === code)
    );
    if (!hit) {
      setScanNote(visible.length ? "" : `Nothing matches “${query.trim()}”.`);
      return;
    }
    update((next) => next.set(hit.id, Math.min(MAX_PER_PRODUCT, (next.get(hit.id) ?? 0) + 1)));
    setScanNote(`${hit.name}: ${(selected.get(hit.id) ?? 0) + 1} label${selected.has(hit.id) ? "s" : ""}`);
    setQuery("");
  }

  const allShown = printable.length > 0 && printable.every((p) => selected.has(p.id));
  const someShown = printable.some((p) => selected.has(p.id));
  function toggleAllShown() {
    update((next) => {
      for (const p of printable) {
        if (allShown) next.delete(p.id);
        else if (!next.has(p.id)) next.set(p.id, suggested(p));
      }
    });
  }

  const chosen = [...selected].flatMap(([id, count]) => {
    const product = byId.get(id);
    return product?.code ? [{ product, count }] : [];
  });
  const totalLabels = chosen.reduce((sum, item) => sum + item.count, 0);
  const tooMany = totalLabels > MAX_LABELS || chosen.length > MAX_ITEMS;
  const preview = chosen[0]?.product ?? printable[0] ?? null;

  const rowClick = (product: LabelProduct) => (event: MouseEvent) => toggle(product, event.shiftKey);

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="min-w-0 space-y-3">
        {notice && (
          <p className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-900">{notice}</p>
        )}
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-52 flex-1">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              type="search"
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setScanNote("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onSearchEnter();
                }
              }}
              placeholder="Search or scan a barcode…"
              aria-label="Search products"
              className="h-10 w-full rounded-lg border border-zinc-300 bg-white pl-9 pr-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15"
            />
          </div>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            aria-label="Category"
            className="h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-brand-600"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        {scanNote && <p className="text-sm text-zinc-600">{scanNote}</p>}

        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs font-medium text-zinc-500">
              <tr>
                <th className="w-10 py-2.5 pl-4">
                  <input
                    type="checkbox"
                    checked={allShown}
                    ref={(el) => {
                      if (el) el.indeterminate = someShown && !allShown;
                    }}
                    onChange={toggleAllShown}
                    disabled={printable.length === 0}
                    aria-label="Tick every product shown"
                    className="h-4 w-4 rounded border-zinc-300"
                  />
                </th>
                <th className="px-3 py-2.5">
                  Product <span className="hidden font-normal text-zinc-400 lg:inline">· shift-click ticks a range</span>
                </th>
                <th className="hidden px-3 py-2.5 text-right sm:table-cell">In stock</th>
                <th className="px-2 py-2.5 text-right sm:px-3">Price</th>
                {/* On phones the counts are set in the Selected panel instead. */}
                <th className="hidden w-28 py-2.5 pl-2 pr-4 text-right sm:table-cell">Labels</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {visible.map((product) => {
                const count = selected.get(product.id);
                const isOn = count !== undefined;
                return (
                  <tr
                    key={product.id}
                    onClick={rowClick(product)}
                    // Shift-click would otherwise select the text between the two rows.
                    onMouseDown={(e) => e.shiftKey && e.preventDefault()}
                    className={
                      !product.code
                        ? "text-zinc-400"
                        : isOn
                          ? "cursor-pointer bg-brand-50/60 hover:bg-brand-50"
                          : "cursor-pointer hover:bg-zinc-50"
                    }
                  >
                    <td className="py-2 pl-4">
                      {product.code && (
                        <input
                          type="checkbox"
                          checked={isOn}
                          readOnly
                          tabIndex={-1}
                          aria-label={`Tick ${product.name}`}
                          className="pointer-events-none h-4 w-4 rounded border-zinc-300"
                        />
                      )}
                    </td>
                    <td className="max-w-0 px-3 py-2">
                      <span className={`line-clamp-2 font-medium sm:block sm:truncate ${product.code ? "text-zinc-900" : ""}`}>
                        {product.name}
                      </span>
                      <span className="block truncate text-xs text-zinc-400">
                        {product.categoryName ?? "Uncategorised"}
                        {product.code ? (
                          <span className="font-mono"> · {product.code}</span>
                        ) : (
                          <>
                            {" · "}
                            <Link
                              href={`/products/${product.id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="font-medium text-amber-700 hover:underline"
                            >
                              add a barcode or SKU
                            </Link>
                          </>
                        )}
                      </span>
                    </td>
                    <td className="hidden whitespace-nowrap px-3 py-2 text-right text-zinc-600 sm:table-cell">
                      {product.trackStock ? `${formatQty(product.stockQty)} ${product.unit}` : "—"}
                    </td>
                    <td className="whitespace-nowrap py-2 pl-2 pr-4 text-right font-medium text-zinc-900 sm:px-3">{product.price}</td>
                    <td className="hidden py-2 pl-2 pr-4 text-right sm:table-cell" onClick={(e) => isOn && e.stopPropagation()}>
                      {isOn ? (
                        <input
                          type="number"
                          min={1}
                          max={MAX_PER_PRODUCT}
                          value={count}
                          onChange={(e) => setCount(product.id, e.target.valueAsNumber)}
                          aria-label={`Labels for ${product.name}`}
                          className="h-8 w-16 rounded-lg border border-zinc-300 bg-white px-2 text-center text-sm text-zinc-900 outline-none focus:border-brand-600"
                        />
                      ) : (
                        <span className="text-zinc-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-zinc-400">
                    No products match this search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {matches.length > VISIBLE_LIMIT && (
            <p className="border-t border-zinc-100 px-4 py-2 text-xs text-zinc-500">
              Showing {VISIBLE_LIMIT} of {matches.length} — type to narrow the list.
            </p>
          )}
        </div>
      </section>

      <form method="get" action="/labels/print" className="space-y-3 lg:sticky lg:top-4">
        <div className="rounded-xl border border-zinc-200 bg-white">
          <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-zinc-900">
              Selected{" "}
              <span className="font-normal text-zinc-500">
                · {chosen.length} item{chosen.length === 1 ? "" : "s"}
              </span>
            </h2>
            {chosen.length > 0 && (
              <button
                type="button"
                onClick={() => setSelected(new Map())}
                className="text-xs font-medium text-zinc-500 hover:text-zinc-900"
              >
                Clear all
              </button>
            )}
          </div>
          {chosen.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-zinc-400">
              Tick products on the left, or scan their barcodes into the search box.
            </p>
          ) : (
            <ul className="max-h-64 divide-y divide-zinc-100 overflow-y-auto">
              {chosen.map(({ product, count }) => (
                <li key={product.id} className="flex items-center gap-2 px-4 py-1.5">
                  <input type="hidden" name="l" value={encodeLabelItem(product.id, count)} />
                  <span className="min-w-0 flex-1 truncate text-sm text-zinc-800">{product.name}</span>
                  <span className="flex items-center rounded-lg border border-zinc-200">
                    <button
                      type="button"
                      onClick={() => setCount(product.id, count - 1)}
                      disabled={count <= 1}
                      aria-label={`One label fewer for ${product.name}`}
                      className="grid h-7 w-7 place-items-center text-zinc-500 hover:text-zinc-900 disabled:opacity-30"
                    >
                      <MinusIcon className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-8 text-center text-sm tabular-nums text-zinc-900">{count}</span>
                    <button
                      type="button"
                      onClick={() => setCount(product.id, count + 1)}
                      disabled={count >= MAX_PER_PRODUCT}
                      aria-label={`One label more for ${product.name}`}
                      className="grid h-7 w-7 place-items-center text-zinc-500 hover:text-zinc-900 disabled:opacity-30"
                    >
                      <PlusIcon className="h-3.5 w-3.5" />
                    </button>
                  </span>
                  <button
                    type="button"
                    onClick={() => update((next) => next.delete(product.id))}
                    aria-label={`Remove ${product.name}`}
                    className="grid h-7 w-7 place-items-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900"
                  >
                    <XIcon className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4">
          <label className="flex items-center justify-between gap-2 text-sm text-zinc-700">
            Label size
            <select
              name="size"
              value={size}
              onChange={(e) => setSize(e.target.value as LabelSize)}
              className="h-8 rounded-lg border border-zinc-300 bg-white px-2 text-sm text-zinc-900 outline-none focus:border-brand-600"
            >
              {Object.entries(LABEL_SIZES).map(([value, option]) => (
                <option key={value} value={value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <div className="grid min-h-32 place-items-center overflow-hidden rounded-lg bg-zinc-100 p-4">
            {preview ? (
              // An A4 cell is a third of the sheet's printable width.
              <div style={size === "A4" ? { width: "62mm" } : undefined}>
                <LabelFace
                  size={size}
                  label={{ name: preview.name, code: preview.code, price: preview.price, unit: preview.unit }}
                />
              </div>
            ) : (
              <p className="text-xs text-zinc-400">Label preview</p>
            )}
          </div>

          {tooMany && (
            <p className="text-xs text-red-600">
              {chosen.length > MAX_ITEMS
                ? `At most ${MAX_ITEMS} products per print — print the rest separately.`
                : `At most ${MAX_LABELS} labels per print — lower some counts.`}
            </p>
          )}
          <button
            type="submit"
            disabled={chosen.length === 0 || tooMany}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-700 px-4 text-sm font-medium text-white transition hover:bg-brand-800 disabled:opacity-50"
          >
            <PrinterIcon className="h-4 w-4" />
            {totalLabels > 0 ? `Print ${totalLabels} label${totalLabels === 1 ? "" : "s"}` : "Print labels"}
          </button>
        </div>
      </form>
    </div>
  );
}
