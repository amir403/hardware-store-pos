"use client";

import { useActionState } from "react";
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
};

const inputClass =
  "h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10";

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
  const [state, formAction] = useActionState(action, {});

  const fieldError = (field: string) =>
    state?.fieldErrors?.[field]?.[0] as string | undefined;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state?.savedAt && !state?.error && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Settings saved.
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
      </div>

      <label className="flex items-start gap-2 text-sm text-zinc-700">
        <input
          type="checkbox"
          name="pricesIncludeTax"
          defaultChecked={defaults.pricesIncludeTax}
          className="mt-0.5 h-4 w-4 rounded border-zinc-300 accent-zinc-900"
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
