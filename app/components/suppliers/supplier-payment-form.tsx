"use client";

import { useActionState, useState } from "react";
import {
  paySupplierAction,
  type SupplierPaymentResult,
} from "@/app/actions/supplier-payments";
import { SubmitButton } from "@/app/components/submit-button";
import { formatMoney } from "@/app/lib/format";

export type OpenPurchase = {
  id: string;
  label: string;
  /** Amount still owed on this particular purchase. */
  due: number;
  dueDate: string | null;
};

const inputClass =
  "h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10";

const labelClass = "text-sm font-medium text-zinc-700";

/**
 * Pays money out to a supplier. Pinning it to a purchase settles that bill;
 * leaving it unpinned parks the money as an advance on the account.
 */
export function SupplierPaymentForm({
  supplierId,
  supplierName,
  currency,
  purchases,
}: {
  supplierId: string;
  supplierName: string;
  currency: string;
  purchases: OpenPurchase[];
}) {
  const [purchaseId, setPurchaseId] = useState("");
  /** null means "still showing the selected purchase's balance". */
  const [amountDraft, setAmountDraft] = useState<string | null>(null);

  const selected = purchases.find((p) => p.id === purchaseId) ?? null;
  const amount = amountDraft ?? (selected ? String(selected.due) : "");

  async function submit(
    previous: SupplierPaymentResult | null,
    formData: FormData
  ): Promise<SupplierPaymentResult> {
    const result = await paySupplierAction(previous, formData);
    if ("ok" in result) {
      setPurchaseId("");
      setAmountDraft(null);
    }
    return result;
  }

  const [state, formAction] = useActionState<
    SupplierPaymentResult | null,
    FormData
  >(submit, null);

  const errorMessage = state && "error" in state ? state.error : null;
  const succeeded = state !== null && "ok" in state;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="supplierId" value={supplierId} />

      {errorMessage && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage}
        </p>
      )}
      {succeeded && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Payment to {supplierName} recorded.
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="supplier-payment-purchase" className={labelClass}>
          Apply to purchase
        </label>
        <select
          id="supplier-payment-purchase"
          name="purchaseId"
          value={purchaseId}
          onChange={(e) => {
            setPurchaseId(e.target.value);
            setAmountDraft(null);
          }}
          className={inputClass}
        >
          <option value="">On the account (advance)</option>
          {purchases.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label} · {formatMoney(p.due, currency)}
              {p.dueDate ? ` · due ${p.dueDate}` : ""}
            </option>
          ))}
        </select>
        <p className="text-xs text-zinc-400">
          Unpinned payments sit as an advance and reduce the overall balance.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="supplier-payment-amount" className={labelClass}>
          Amount *
        </label>
        <input
          id="supplier-payment-amount"
          name="amount"
          type="number"
          min="0.01"
          step="0.01"
          required
          value={amount}
          onChange={(e) => setAmountDraft(e.target.value)}
          placeholder="0.00"
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="supplier-payment-method" className={labelClass}>
          Method
        </label>
        <select
          id="supplier-payment-method"
          name="method"
          defaultValue="CASH"
          className={inputClass}
        >
          <option value="CASH">Cash</option>
          <option value="CARD">Card</option>
          <option value="BANK_TRANSFER">Bank transfer</option>
          <option value="MOBILE">Mobile</option>
          <option value="OTHER">Other</option>
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="supplier-payment-note" className={labelClass}>
          Note
        </label>
        <input
          id="supplier-payment-note"
          name="note"
          maxLength={300}
          placeholder="e.g. cheque 4471"
          className={inputClass}
        />
      </div>

      <SubmitButton>Record payment</SubmitButton>
    </form>
  );
}
