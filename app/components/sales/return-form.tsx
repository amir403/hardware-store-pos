"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { returnSaleItemsAction } from "@/app/actions/sales";
import { formatMoney, formatQty, round2, round3 } from "@/app/lib/format";

export type ReturnableItem = {
  id: string;
  name: string;
  sold: number;
  /** Quantity not yet brought back. */
  remaining: number;
  /** What the customer paid for the whole line, after the bill discount. */
  lineValue: number;
  /** Part of lineValue already credited on earlier returns. */
  credited: number;
};

const inputClass =
  "h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15";

/** Mirrors returnSaleItemsAction's line value; the server figure is final. */
function lineCredit(item: ReturnableItem, quantity: number): number {
  const valueLeft = round2(Math.max(0, item.lineValue - item.credited));
  if (quantity <= 0) return 0;
  if (quantity >= item.remaining) return valueLeft;
  return round2(Math.min(valueLeft, (item.lineValue * quantity) / item.sold));
}

export function ReturnForm({
  saleId,
  invoiceNo,
  items,
  customerName,
  netTotal,
  settled,
  currency,
}: {
  saleId: string;
  invoiceNo: string;
  items: ReturnableItem[];
  /** null for a walk-in sale — there is no account to hold credit. */
  customerName: string | null;
  netTotal: number;
  settled: number;
  currency: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  /** null means "hand back everything that can be handed back". */
  const [refundDraft, setRefundDraft] = useState<string | null>(null);
  const [refundMethod, setRefundMethod] = useState("CASH");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const lines = items
    .map((item) => {
      const quantity = round3(
        Math.min(item.remaining, Math.max(0, Number(quantities[item.id]) || 0))
      );
      return { item, quantity, credit: lineCredit(item, quantity) };
    })
    .filter((line) => line.quantity > 0);

  const amount = round2(lines.reduce((sum, line) => sum + line.credit, 0));
  // Cash can only go back for what was paid beyond the reduced bill.
  const maxRefund = round2(
    Math.min(amount, Math.max(0, settled - (netTotal - amount)))
  );
  const refund = customerName
    ? round2(
        Math.min(
          maxRefund,
          Math.max(0, refundDraft === null ? maxRefund : Number(refundDraft) || 0)
        )
      )
    : maxRefund;
  const toCredit = round2(amount - refund);

  function submit() {
    setError(null);
    if (lines.length === 0) {
      setError("Enter how many of each item came back.");
      return;
    }
    startTransition(async () => {
      const result = await returnSaleItemsAction({
        saleId,
        items: lines.map((line) => ({
          saleItemId: line.item.id,
          quantity: line.quantity,
        })),
        refundAmount: refund,
        refundMethod: refundMethod as "CASH",
        reason: reason.trim() || null,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.push(`/sales/${saleId}?returned=${result.returnNo}`);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <div className="border-b border-zinc-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-900">
            Items on {invoiceNo}
          </h2>
        </div>
        <table className="w-full min-w-[640px] text-left lg:min-w-0 text-sm">
          <thead>
            <tr className="border-b border-zinc-100 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <th className="px-4 py-2 font-medium">Item</th>
              <th className="px-4 py-2 text-right font-medium">Sold</th>
              <th className="px-4 py-2 text-right font-medium">Can return</th>
              <th className="px-4 py-2 font-medium">Returning</th>
              <th className="px-4 py-2 text-right font-medium">Credit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {items.map((item) => {
              const line = lines.find((l) => l.item.id === item.id);
              return (
                <tr key={item.id}>
                  <td className="px-4 py-2 font-medium text-zinc-900">
                    {item.name}
                  </td>
                  <td className="px-4 py-2 text-right text-zinc-600">
                    {formatQty(item.sold)}
                  </td>
                  <td className="px-4 py-2 text-right text-zinc-600">
                    {item.remaining > 0 ? formatQty(item.remaining) : "—"}
                  </td>
                  <td className="px-4 py-2">
                    {item.remaining > 0 ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          max={item.remaining}
                          step="any"
                          value={quantities[item.id] ?? ""}
                          onChange={(e) =>
                            setQuantities((prev) => ({
                              ...prev,
                              [item.id]: e.target.value,
                            }))
                          }
                          placeholder="0"
                          className="h-8 w-20 rounded-md border border-zinc-300 bg-white px-2 text-right text-sm text-zinc-900 outline-none focus:border-brand-600"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setQuantities((prev) => ({
                              ...prev,
                              [item.id]: String(item.remaining),
                            }))
                          }
                          className="text-xs text-zinc-500 hover:text-zinc-900 hover:underline"
                        >
                          all
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-zinc-400">
                        fully returned
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right font-medium text-zinc-900">
                    {line ? formatMoney(line.credit, currency) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 gap-4 rounded-xl border border-zinc-200 bg-white p-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-zinc-700">
            Cash paid back
          </label>
          {customerName ? (
            <input
              type="number"
              min="0"
              max={maxRefund}
              step="0.01"
              value={refundDraft ?? String(maxRefund)}
              onChange={(e) => setRefundDraft(e.target.value)}
              className={inputClass}
            />
          ) : (
            <p className="flex h-10 items-center text-sm font-semibold text-zinc-900">
              {formatMoney(refund, currency)}
            </p>
          )}
          <p className="text-xs text-zinc-400">
            {customerName
              ? `Up to ${formatMoney(maxRefund, currency)}. The rest is credited to ${customerName}'s account.`
              : "Walk-in sale — the full value is paid back."}
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-zinc-700">Paid back by</label>
          <select
            value={refundMethod}
            onChange={(e) => setRefundMethod(e.target.value)}
            disabled={refund <= 0}
            className={`${inputClass} disabled:bg-zinc-50 disabled:text-zinc-400`}
          >
            <option value="CASH">Cash</option>
            <option value="CARD">Card</option>
            <option value="BANK_TRANSFER">Bank transfer</option>
            <option value="MOBILE">Mobile</option>
            <option value="OTHER">Other</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-zinc-700">Reason</label>
          <input
            type="text"
            maxLength={300}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. wrong size, damaged"
            className={inputClass}
          />
        </div>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-6 border-t border-zinc-100 pt-4">
        <div className="text-right">
          <p className="text-xs text-zinc-500">Value returned</p>
          <p className="text-lg font-semibold text-zinc-900">
            {formatMoney(amount, currency)}
          </p>
        </div>
        {customerName && toCredit > 0 && (
          <div className="text-right">
            <p className="text-xs text-zinc-500">Off their account</p>
            <p className="text-lg font-semibold text-emerald-700">
              {formatMoney(toCredit, currency)}
            </p>
          </div>
        )}
        <button
          type="button"
          disabled={isPending || lines.length === 0}
          onClick={submit}
          className="flex h-10 items-center rounded-xl bg-brand-700 px-5 text-sm font-semibold text-white transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Record return"}
        </button>
      </div>
    </div>
  );
}
