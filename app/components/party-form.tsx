"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/actions/products";
import { SubmitButton } from "@/app/components/submit-button";

export type PartyDefaults = {
  id?: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  creditLimit?: string;
  priceTier?: "RETAIL" | "WHOLESALE";
};

const inputClass =
  "h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10";

const labelClass = "text-sm font-medium text-zinc-700";

export function PartyForm({
  action,
  defaults,
  submitLabel,
  showCreditLimit = false,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  defaults: PartyDefaults;
  submitLabel: string;
  /** Customers can buy on credit; suppliers have no such field. */
  showCreditLimit?: boolean;
}) {
  const [state, formAction] = useActionState(action, {});

  const fieldError = (field: string) =>
    state?.fieldErrors?.[field]?.[0] as string | undefined;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {defaults.id && <input type="hidden" name="id" value={defaults.id} />}

      {state?.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="party-name" className={labelClass}>
          Name *
        </label>
        <input
          id="party-name"
          name="name"
          required
          maxLength={80}
          defaultValue={defaults.name}
          placeholder="Full name"
          className={inputClass}
        />
        {fieldError("name") && (
          <p className="text-xs text-red-600">{fieldError("name")}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="party-phone" className={labelClass}>
          Phone
        </label>
        <input
          id="party-phone"
          name="phone"
          maxLength={20}
          defaultValue={defaults.phone}
          placeholder="0300-1234567"
          className={inputClass}
        />
        {fieldError("phone") && (
          <p className="text-xs text-red-600">{fieldError("phone")}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="party-email" className={labelClass}>
          Email
        </label>
        <input
          id="party-email"
          name="email"
          type="email"
          maxLength={80}
          defaultValue={defaults.email}
          placeholder="name@example.com"
          className={inputClass}
        />
        {fieldError("email") && (
          <p className="text-xs text-red-600">{fieldError("email")}</p>
        )}
      </div>

      {showCreditLimit && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="party-credit-limit" className={labelClass}>
            Credit limit
          </label>
          <input
            id="party-credit-limit"
            name="creditLimit"
            type="number"
            min="0"
            step="0.01"
            defaultValue={defaults.creditLimit ?? ""}
            placeholder="No limit"
            className={inputClass}
          />
          <p className="text-xs text-zinc-400">
            Leave empty to allow any outstanding balance.
          </p>
          {fieldError("creditLimit") && (
            <p className="text-xs text-red-600">{fieldError("creditLimit")}</p>
          )}
        </div>
      )}

      {showCreditLimit && (
        <label className="flex items-start gap-2 text-sm text-zinc-700">
          <input
            type="checkbox"
            name="priceTier"
            value="WHOLESALE"
            defaultChecked={defaults.priceTier === "WHOLESALE"}
            className="mt-0.5 h-4 w-4 rounded border-zinc-300 accent-zinc-900"
          />
          <span>
            Wholesale customer
            <span className="block text-xs text-zinc-400">
              The POS charges wholesale prices where a product has one.
            </span>
          </span>
        </label>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="party-address" className={labelClass}>
          Address
        </label>
        <input
          id="party-address"
          name="address"
          maxLength={200}
          defaultValue={defaults.address}
          placeholder="Street, city"
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="party-notes" className={labelClass}>
          Notes
        </label>
        <textarea
          id="party-notes"
          name="notes"
          rows={2}
          maxLength={300}
          defaultValue={defaults.notes}
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
        />
      </div>

      <SubmitButton>{submitLabel}</SubmitButton>
    </form>
  );
}
