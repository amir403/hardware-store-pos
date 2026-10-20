"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon, MinusIcon, Trash2Icon } from "lucide-react";
import { createPurchaseAction } from "@/app/actions/purchases";
import { formatMoney, round2, round3 } from "@/app/lib/format";

export type PurchaseProduct = {
  id: string;
  name: string;
  sku: string | null;
  costPrice: number;
  unit: string;
  trackStock: boolean;
};

export type PurchaseSupplier = { id: string; name: string };

type PurchaseLine = {
  productId: string;
  name: string;
  unit: string;
  quantity: number;
  unitCost: number;
};

export type PurchaseLineSeed = {
  productId: string;
  name: string;
  unit: string;
  quantity: number;
  unitCost: number;
};

const inputClass =
  "h-9 w-full rounded-lg border border-zinc-300 bg-white px-2.5 text-sm text-zinc-900 outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10";

export function PurchaseForm({
  products,
  suppliers,
  currency,
  initialLines = [],
  initialSupplierId = "",
  initialNote = "",
}: {
  products: PurchaseProduct[];
  suppliers: PurchaseSupplier[];
  currency: string;
  /**
   * Lines handed over by a reorder draft. Plain values, so the page stays a
   * server component and the form needs no effect to pick them up.
   */
  initialLines?: PurchaseLineSeed[];
  initialSupplierId?: string;
  initialNote?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [query, setQuery] = useState("");
  const [lines, setLines] = useState<PurchaseLine[]>(initialLines);
  const [supplierId, setSupplierId] = useState(initialSupplierId);
  const [referenceNo, setReferenceNo] = useState("");
  const [note, setNote] = useState(initialNote);
  const [updateCost, setUpdateCost] = useState(true);
  /** Empty means "paid in full", so a cash purchase needs no extra typing. */
  const [paidDraft, setPaidDraft] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products.slice(0, 6);
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.sku && p.sku.toLowerCase().includes(q))
      )
      .slice(0, 6);
  }, [products, query]);

  const total = useMemo(
    () =>
      round2(
        lines.reduce(
          (sum, l) => sum + l.quantity * l.unitCost,
          0
        )
      ),
    [lines]
  );

  const paid = paidDraft === "" ? total : Math.max(0, Number(paidDraft) || 0);
  const balanceDue = round2(Math.max(0, total - paid));

  function addLine(product: PurchaseProduct) {
    setError(null);
    setLines((prev) => {
      if (prev.some((l) => l.productId === product.id)) return prev;
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          unit: product.unit,
          quantity: 1,
          unitCost: product.costPrice,
        },
      ];
    });
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (results.length > 0) {
      addLine(results[0]);
      setQuery("");
    }
  }

  function updateLine(
    productId: string,
    patch: Partial<Pick<PurchaseLine, "quantity" | "unitCost">>
  ) {
    setLines((prev) =>
      prev.map((l) =>
        l.productId === productId
          ? {
              ...l,
              ...patch,
              quantity: Math.max(0.001, patch.quantity ?? l.quantity),
              unitCost: Math.max(0, patch.unitCost ?? l.unitCost),
            }
          : l
      )
    );
  }

  function removeLine(productId: string) {
    setLines((prev) => prev.filter((l) => l.productId !== productId));
  }

  function submit() {
    setError(null);
    if (lines.length === 0) {
      setError("Add at least one product to the purchase.");
      return;
    }
    if (balanceDue > 0 && !supplierId) {
      setError("Choose a supplier before leaving a balance unpaid.");
      return;
    }

    startTransition(async () => {
      const result = await createPurchaseAction({
        supplierId: supplierId || null,
        referenceNo: referenceNo || null,
        note: note || null,
        updateCost,
        paidAmount: round2(Math.min(paid, total)),
        dueDate: balanceDue > 0 && dueDate ? dueDate : null,
        items: lines.map((l) => ({
          productId: l.productId,
          quantity: round3(l.quantity),
          unitCost: round2(l.unitCost),
        })),
      });

      if ("error" in result) {
        setError(result.error);
        return;
      }

      router.push(`/purchases/${result.purchaseId}?new=1`);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header fields */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-zinc-700">Supplier</label>
          <select
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            className={inputClass}
          >
            <option value="">— No supplier —</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-zinc-700">
            Reference / invoice no
          </label>
          <input
            type="text"
            maxLength={60}
            value={referenceNo}
            onChange={(e) => setReferenceNo(e.target.value)}
            placeholder="e.g. INV-2026-0451"
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-zinc-700">Note</label>
          <input
            type="text"
            maxLength={300}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="optional"
            className={inputClass}
          />
        </div>
      </div>

      {/* Product search */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-zinc-700">
          Add products
        </label>
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          placeholder="Search product name or SKU, press Enter to add…"
          className="h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
        />
        {query && results.length > 0 && (
          <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {results.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  addLine(p);
                  setQuery("");
                  searchRef.current?.focus();
                }}
                className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-3 py-2 text-left text-sm transition hover:border-zinc-900"
              >
                <span className="min-w-0 truncate text-zinc-900">
                  {p.name}
                </span>
                <span className="shrink-0 text-xs text-zinc-400">
                  {p.sku ?? ""}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Lines */}
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <div className="border-b border-zinc-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-900">
            Purchase items
            <span className="ml-2 text-xs font-normal text-zinc-400">
              {lines.length} line{lines.length === 1 ? "" : "s"}
            </span>
          </h2>
        </div>

        {lines.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-zinc-400">
            Search and add products received in this purchase.
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-4 py-2 font-medium">Product</th>
                <th className="px-2 py-2 font-medium">Qty</th>
                <th className="px-2 py-2 font-medium">Unit cost</th>
                <th className="px-4 py-2 text-right font-medium">Total</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {lines.map((line) => {
                const lineTotal = round2(line.quantity * line.unitCost);
                return (
                  <tr key={line.productId}>
                    <td className="px-4 py-2">
                      <p className="max-w-64 truncate font-medium text-zinc-900">
                        {line.name}
                      </p>
                      <p className="text-[11px] text-zinc-400">
                        per {line.unit}
                      </p>
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            updateLine(line.productId, {
                              quantity: round3(line.quantity - 1),
                            })
                          }
                          className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 text-zinc-500 hover:bg-zinc-50"
                        >
                          <MinusIcon className="h-3 w-3" />
                        </button>
                        <input
                          type="number"
                          min="0.001"
                          step="any"
                          value={line.quantity}
                          onChange={(e) =>
                            updateLine(line.productId, {
                              quantity: Number(e.target.value),
                            })
                          }
                          className="h-7 w-20 rounded-md border border-zinc-300 bg-white px-1.5 text-center text-sm text-zinc-900 outline-none focus:border-zinc-900"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            updateLine(line.productId, {
                              quantity: round3(line.quantity + 1),
                            })
                          }
                          className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 text-zinc-500 hover:bg-zinc-50"
                        >
                          <PlusIcon className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.unitCost}
                        onChange={(e) =>
                          updateLine(line.productId, {
                            unitCost: Number(e.target.value),
                          })
                        }
                        className="h-7 w-24 rounded-md border border-zinc-300 bg-white px-1.5 text-right text-sm text-zinc-900 outline-none focus:border-zinc-900"
                      />
                    </td>
                    <td className="px-4 py-2 text-right font-semibold text-zinc-900">
                      {formatMoney(lineTotal, currency)}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => removeLine(line.productId)}
                        className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2Icon className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Payment to the supplier */}
      {lines.length > 0 && (
        <div className="grid grid-cols-1 gap-4 rounded-xl border border-zinc-200 bg-white p-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-zinc-700">
              Paid now
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={paidDraft}
              onChange={(e) => setPaidDraft(e.target.value)}
              placeholder={`${round2(total)} (full)`}
              className={inputClass}
            />
            <p className="text-xs text-zinc-400">
              Leave empty if paid in full.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-zinc-700">
              Pay balance by
            </label>
            <input
              type="date"
              value={dueDate}
              disabled={balanceDue <= 0}
              onChange={(e) => setDueDate(e.target.value)}
              className={`${inputClass} disabled:bg-zinc-50 disabled:text-zinc-400`}
            />
          </div>
          <div className="flex flex-col justify-center gap-0.5 sm:items-end">
            <p className="text-xs text-zinc-500">Left unpaid</p>
            <p
              className={`text-lg font-semibold ${
                balanceDue > 0 ? "text-amber-700" : "text-zinc-400"
              }`}
            >
              {formatMoney(balanceDue, currency)}
            </p>
            {balanceDue > 0 && (
              <p className="text-xs text-zinc-400">
                {supplierId
                  ? "goes on the supplier's account"
                  : "choose a supplier to owe this"}
              </p>
            )}
          </div>
        </div>
      )}

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {/* Footer */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-zinc-100 pt-4">
        <label className="flex items-center gap-2 text-sm text-zinc-700">
          <input
            type="checkbox"
            checked={updateCost}
            onChange={(e) => setUpdateCost(e.target.checked)}
            className="h-4 w-4 rounded border-zinc-300 accent-zinc-900"
          />
          Update product cost prices to latest
        </label>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-xs text-zinc-500">Purchase total</p>
            <p className="text-lg font-semibold text-zinc-900">
              {formatMoney(total, currency)}
            </p>
          </div>
          <button
            type="button"
            disabled={isPending || lines.length === 0}
            onClick={submit}
            className="flex h-10 items-center rounded-xl bg-zinc-900 px-5 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Saving…" : "Record purchase"}
          </button>
        </div>
      </div>
    </div>
  );
}
