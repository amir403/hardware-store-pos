"use client";

import { useActionState } from "react";
import { completeSetupAction, type SetupState } from "@/app/actions/setup";
import { SubmitButton } from "@/app/components/submit-button";

const inputClass =
  "h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15";
const labelClass = "text-sm font-medium text-zinc-700";

export function SetupForm() {
  const [state, formAction] = useActionState<SetupState, FormData>(completeSetupAction, {});
  const err = (field: string) =>
    state.fieldErrors?.[field]?.[0] && <p className="text-xs text-red-600">{state.fieldErrors[field]![0]}</p>;

  const field = (id: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <input id={id} name={id} className={inputClass} {...props} defaultValue={state.values?.[id] ?? props.defaultValue} />
      {err(id)}
    </div>
  );

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-zinc-900">1. Your shop</h2>
        {field("storeName", "Shop name *", { required: true, maxLength: 80, autoFocus: true, placeholder: "Raza Hardware & Tools" })}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_8rem]">
          {field("phone", "Phone", { maxLength: 20, placeholder: "0300-1234567" })}
          {field("currency", "Currency *", { required: true, maxLength: 10, defaultValue: "PKR" })}
        </div>
        {field("address", "Address", { maxLength: 200, placeholder: "Shop 12, Main Bazaar, Lahore" })}
        <p className="text-xs text-zinc-400">Printed on every receipt. You can change all of this later in Settings.</p>
      </section>

      <section className="flex flex-col gap-4 border-t border-zinc-100 pt-6">
        <h2 className="text-sm font-semibold text-zinc-900">2. Owner account</h2>
        {field("name", "Your name *", { required: true, maxLength: 80, autoComplete: "name" })}
        {field("email", "Email *", { required: true, type: "email", autoComplete: "username", placeholder: "you@example.com" })}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {field("password", "Password *", { required: true, type: "password", minLength: 8, maxLength: 72, autoComplete: "new-password" })}
          {field("confirm", "Repeat password *", { required: true, type: "password", minLength: 8, maxLength: 72, autoComplete: "new-password" })}
        </div>
        <p className="text-xs text-zinc-400">
          This is the admin account: it can do everything, including adding cashiers and managers. At least 8 characters;
          keep it somewhere safe.
        </p>
      </section>

      <SubmitButton pendingLabel="Setting up…">Start using the POS</SubmitButton>
    </form>
  );
}
