"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/actions/products";
import { SubmitButton } from "@/app/components/submit-button";

export type UserDefaults = {
  id?: string;
  name: string;
  email: string;
  role: "ADMIN" | "MANAGER" | "CASHIER";
  isActive?: boolean;
};

const ROLES = [
  { value: "CASHIER", label: "Cashier" },
  { value: "MANAGER", label: "Manager" },
  { value: "ADMIN", label: "Admin" },
] as const;

const inputClass =
  "h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10";

const labelClass = "text-sm font-medium text-zinc-700";

export function UserForm({
  action,
  defaults,
  submitLabel,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  defaults: UserDefaults;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, {});
  const isEdit = Boolean(defaults.id);

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
        <label htmlFor="user-name" className={labelClass}>
          Name
        </label>
        <input
          id="user-name"
          name="name"
          maxLength={80}
          defaultValue={defaults.name}
          placeholder="Ali Raza"
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="user-email" className={labelClass}>
          Email *
        </label>
        <input
          id="user-email"
          name="email"
          type="email"
          required
          maxLength={80}
          defaultValue={defaults.email}
          placeholder="name@store.com"
          className={inputClass}
        />
        {fieldError("email") && (
          <p className="text-xs text-red-600">{fieldError("email")}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="user-password" className={labelClass}>
          {isEdit ? "New password" : "Password *"}
        </label>
        <input
          id="user-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required={!isEdit}
          minLength={isEdit ? undefined : 8}
          defaultValue=""
          placeholder={
            isEdit ? "Leave blank to keep current password" : "min. 8 characters"
          }
          className={inputClass}
        />
        {fieldError("password") && (
          <p className="text-xs text-red-600">{fieldError("password")}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="user-role" className={labelClass}>
          Role *
        </label>
        <select
          id="user-role"
          name="role"
          defaultValue={defaults.role}
          className={inputClass}
        >
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        {fieldError("role") && (
          <p className="text-xs text-red-600">{fieldError("role")}</p>
        )}
      </div>

      {isEdit && (
        <label className="flex items-center gap-2 text-sm text-zinc-700">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={defaults.isActive ?? true}
            className="h-4 w-4 rounded border-zinc-300 accent-zinc-900"
          />
          Active (inactive users cannot sign in)
        </label>
      )}

      <SubmitButton>{submitLabel}</SubmitButton>
    </form>
  );
}
