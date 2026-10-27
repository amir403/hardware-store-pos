"use client";

import { useActionState } from "react";
import { useSuccessToast } from "@/app/components/toast";
import { LABEL_SIZES, RECEIPT_PAPERS } from "@/app/lib/print-formats";
import type { SettingsFormState } from "@/app/actions/settings";
import { SubmitButton } from "@/app/components/submit-button";

export type SettingsDefaults = {
  storeName: string;
  address: string;
  phone: string;
  currency: string;
  taxRate: string;
  pricesIncludeTax: boolean;
  receiptFooter: string;
  receiptPaper: string;
  labelSize: string;
  cashierMaxDiscountPct: string;
};

const inputClass =
  "h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15";

const labelClass = "text-sm font-medium text-zinc-700";

export function SettingsForm({
  action,
  defaults,
}: {
  action: (
    state: SettingsFormState,
    formData: FormData
  ) => Promise<SettingsFormState>;
  defaults: SettingsDefaults;
}) {
  const [state, formAction] = useActionState(
    useSuccessToast(action, "Settings saved"),
    {}
  );

  const fieldError = (field: string) =>
    state?.fieldErrors?.[field]?.[0] as string | undefined;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="storeName" className={labelClass}>
          Store name *
        </label>
        <input
          id="storeName"
          name="storeName"
          required
          maxLength={80}
          defaultValue={defaults.storeName}
          placeholder="Raza Hardware Store"
          className={inputClass}
        />
        {fieldError("storeName") && (
          <p className="text-xs text-red-600">{fieldError("storeName")}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="address" className={labelClass}>
          Address
        </label>
        <input
          id="address"
          name="address"
          maxLength={200}
          defaultValue={defaults.address}
          placeholder="Shop 12, Main Bazaar, Lahore"
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="phone" className={labelClass}>
            Phone
          </label>
          <input
            id="phone"
            name="phone"
            maxLength={20}
            defaultValue={defaults.phone}
            placeholder="042-1234567"
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="currency" className={labelClass}>
            Currency *
          </label>
          <input
            id="currency"
            name="currency"
            required
            maxLength={10}
            defaultValue={defaults.currency}
            placeholder="PKR"
            className={inputClass}
          />
          {fieldError("currency") && (
            <p className="text-xs text-red-600">{fieldError("currency")}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="taxRate" className={labelClass}>
            Default tax rate (%)
          </label>
          <input
            id="taxRate"
            name="taxRate"
            type="number"
            step="0.01"
            min="0"
            max="99.99"
            defaultValue={defaults.taxRate}
            className={inputClass}
          />
          {fieldError("taxRate") && (
            <p className="text-xs text-red-600">{fieldError("taxRate")}</p>
          )}
          <p className="text-xs text-zinc-400">
            Pre-fills new products; each product can override it.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="receiptFooter" className={labelClass}>
            Receipt footer
          </label>
          <input
            id="receiptFooter"
            name="receiptFooter"
            maxLength={300}
            defaultValue={defaults.receiptFooter}
            placeholder="Thank you for your business!"
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="receiptPaper" className={labelClass}>
            Receipt printer
          </label>
          <select
            id="receiptPaper"
            name="receiptPaper"
            defaultValue={defaults.receiptPaper}
            className={inputClass}
          >
            {Object.entries(RECEIPT_PAPERS).map(([value, paper]) => (
              <option key={value} value={value}>
                {paper.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-zinc-400">
            Sale receipts and quotations print in this width.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="labelSize" className={labelClass}>
            Barcode labels
          </label>
          <select
            id="labelSize"
            name="labelSize"
            defaultValue={defaults.labelSize}
            className={inputClass}
          >
            {Object.entries(LABEL_SIZES).map(([value, size]) => (
              <option key={value} value={value}>
                {size.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-zinc-400">
            Default label stock; it can be changed on the label page too.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="cashierMaxDiscountPct" className={labelClass}>
            Cashier discount limit (%)
          </label>
          <input
            id="cashierMaxDiscountPct"
            name="cashierMaxDiscountPct"
            type="number"
            min="0"
            max="100"
            step="0.5"
            defaultValue={defaults.cashierMaxDiscountPct}
            className={inputClass}
          />
          <p className="text-xs text-zinc-400">
            Cashiers cannot lower prices or discount a bill beyond this; a
            manager or admin has to complete it.
          </p>
          {fieldError("cashierMaxDiscountPct") && (
            <p className="text-xs text-red-600">{fieldError("cashierMaxDiscountPct")}</p>
          )}
        </div>
      </div>

      <label className="flex items-start gap-2 text-sm text-zinc-700">
        <input
          type="checkbox"
          name="pricesIncludeTax"
          defaultChecked={defaults.pricesIncludeTax}
          className="mt-0.5 h-4 w-4 rounded border-zinc-300 accent-brand-700"
        />
        <span>
          Product prices already include tax
          <span className="block text-xs text-zinc-400">
            If checked, tax is extracted from the listed price. Otherwise tax
            is added on top at checkout.
          </span>
        </span>
      </label>

      <div className="border-t border-zinc-100 pt-4">
        <SubmitButton pendingLabel="Saving…">Save settings</SubmitButton>
      </div>
    </form>
  );
}
