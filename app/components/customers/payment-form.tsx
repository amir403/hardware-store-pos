"use client";

import { useActionState, useState } from "react";
import {
  receivePaymentAction,
  type PaymentResult,
} from "@/app/actions/payments";
import { SubmitButton } from "@/app/components/submit-button";
import { formatMoney } from "@/app/lib/format";

export type OpenInvoice = {
  id: string;
  invoiceNo: string;
  /** Balance still owing on this particular invoice. */
  due: number;
  dueDate: string | null;
};

const inputClass =
  "h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10";

const labelClass = "text-sm font-medium text-zinc-700";

/**
 * Receives money against a customer's account. Pinning a payment to an invoice
 * settles that bill; leaving it unpinned parks the money as an advance.
 */
export function PaymentForm({
  customerId,
  customerName,
  currency,
  invoices,
}: {
  customerId: string;
  customerName: string;
  currency: string;
  invoices: OpenInvoice[];
}) {
  const [saleId, setSaleId] = useState("");
  /** null means "still showing the selected invoice's balance". */
  const [amountDraft, setAmountDraft] = useState<string | null>(null);

  const selected = invoices.find((invoice) => invoice.id === saleId) ?? null;
  // Picking an invoice adopts its remaining balance; editing the amount box
  // overrides it for a part payment. Derived during render, no effect needed.
  const amount = amountDraft ?? (selected ? String(selected.due) : "");

  async function submit(
    _previous: PaymentResult | null,
    formData: FormData
  ): Promise<PaymentResult> {
    const result = await receivePaymentAction(_previous, formData);
    // Start blank again for the next customer at the counter.
    if ("ok" in result) {
      setSaleId("");
      setAmountDraft(null);
    }
    return result;
  }

  const [state, formAction] = useActionState<PaymentResult | null, FormData>(
    submit,
    null
  );

  // PaymentResult is a union, so each arm has to be narrowed before reading it.
  const errorMessage = state && "error" in state ? state.error : null;
  const succeeded = state !== null && "ok" in state;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="customerId" value={customerId} />

      {errorMessage && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage}
        </p>
      )}
      {succeeded && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Payment received on {customerName}&apos;s account.
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="payment-sale" className={labelClass}>
          Apply to invoice
        </label>
        <select
          id="payment-sale"
          name="saleId"
          value={saleId}
          onChange={(e) => {
            // Switching invoice drops any manual override so the new balance
            // shows through.
            setSaleId(e.target.value);
            setAmountDraft(null);
          }}
          className={inputClass}
        >
          <option value="">On the account (advance)</option>
          {invoices.map((invoice) => (
            <option key={invoice.id} value={invoice.id}>
              {invoice.invoiceNo} · {formatMoney(invoice.due, currency)}
              {invoice.dueDate ? ` · due ${invoice.dueDate}` : ""}
            </option>
          ))}
        </select>
        <p className="text-xs text-zinc-400">
          Unpinned payments sit as credit and reduce the overall balance.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="payment-amount" className={labelClass}>
          Amount *
        </label>
        <input
          id="payment-amount"
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
        <label htmlFor="payment-method" className={labelClass}>
          Method
        </label>
        <select id="payment-method" name="method" defaultValue="CASH" className={inputClass}>
          <option value="CASH">Cash</option>
          <option value="CARD">Card</option>
          <option value="BANK_TRANSFER">Bank transfer</option>
          <option value="MOBILE">Mobile</option>
          <option value="OTHER">Other</option>
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="payment-note" className={labelClass}>
          Note
        </label>
        <input
          id="payment-note"
          name="note"
          maxLength={300}
          placeholder="e.g. cheque 4471"
          className={inputClass}
        />
      </div>

      <SubmitButton>Receive payment</SubmitButton>
    </form>
  );
}
