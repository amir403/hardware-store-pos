"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { returnToSupplierAction } from "@/app/actions/purchases";
import { useToast } from "@/app/components/toast";
import { formatMoney, formatQty } from "@/app/lib/format";

export type ReturnablePurchaseItem = {
  id: string;
  name: string;
  bought: number;
  /** Not yet sent back, and no more than is still on the shelf. */
  canReturn: number;
  unitCost: number;
};

export function SupplierReturnForm({
  purchaseId,
  items,
  currency,
}: {
  purchaseId: string;
  items: ReturnablePurchaseItem[];
  currency: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const lines = items
    .map((item) => ({
      item,
      quantity: Math.min(item.canReturn, Math.max(0, Number(quantities[item.id]) || 0)),
    }))
    .filter((l) => l.quantity > 0);
  // Estimate only; the server works out the exact credit per line.
  const estimate = lines.reduce((sum, l) => sum + l.quantity * l.item.unitCost, 0);

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await returnToSupplierAction({
        purchaseId,
        items: lines.map((l) => ({ purchaseItemId: l.item.id, quantity: l.quantity })),
        reason: reason.trim() || null,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast("Returned to supplier — stock and balance updated");
      router.push(`/purchases/${purchaseId}`);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="w-full min-w-[560px] text-left text-sm lg:min-w-0">
          <thead>
            <tr className="border-b border-zinc-100 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <th className="px-4 py-2 font-medium">Item</th>
              <th className="px-4 py-2 text-right font-medium">Bought</th>
              <th className="px-4 py-2 text-right font-medium">Can return</th>
              <th className="px-4 py-2 font-medium">Sending back</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {items.map((item) => (
              <tr key={item.id}>
                <td className="px-4 py-2 font-medium text-zinc-900">{item.name}</td>
                <td className="px-4 py-2 text-right text-zinc-600">{formatQty(item.bought)}</td>
                <td className="px-4 py-2 text-right text-zinc-600">
                  {item.canReturn > 0 ? formatQty(item.canReturn) : "—"}
                </td>
                <td className="px-4 py-2">
                  {item.canReturn > 0 ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        max={item.canReturn}
                        step="any"
                        value={quantities[item.id] ?? ""}
                        onChange={(e) =>
                          setQuantities((prev) => ({ ...prev, [item.id]: e.target.value }))
                        }
                        placeholder="0"
                        className="h-8 w-20 rounded-md border border-zinc-300 bg-white px-2 text-right text-sm text-zinc-900 outline-none focus:border-zinc-900"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setQuantities((prev) => ({ ...prev, [item.id]: String(item.canReturn) }))
                        }
                        className="text-xs text-zinc-500 hover:text-zinc-900 hover:underline"
                      >
                        all
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs text-zinc-400">nothing left to return</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="supplier-return-reason" className="text-sm font-medium text-zinc-700">
          Reason
        </label>
        <input
          id="supplier-return-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={300}
          placeholder="e.g. damaged in delivery, wrong size"
          className="h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
        />
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-4 border-t border-zinc-100 pt-4">
        <div className="text-right">
          <p className="text-xs text-zinc-500">Comes off what you owe (approx.)</p>
          <p className="text-lg font-semibold text-zinc-900">{formatMoney(estimate, currency)}</p>
        </div>
        <button
          type="button"
          disabled={isPending || lines.length === 0}
          onClick={submit}
          className="flex h-10 items-center rounded-xl bg-zinc-900 px-5 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Send back"}
        </button>
      </div>
    </div>
  );
}
