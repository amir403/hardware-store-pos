"use client";

import { useActionState, useRef, useState } from "react";
import { EyeIcon, EyeOffIcon, WandSparklesIcon } from "lucide-react";
import { ROLE_INFO, ROLE_ORDER } from "@/app/lib/roles";
import { useSuccessToast } from "@/app/components/toast";
import type { FormState } from "@/app/actions/products";
import { SubmitButton } from "@/app/components/submit-button";

export type UserDefaults = {
  id?: string;
  name: string;
  email: string;
  role: "ADMIN" | "MANAGER" | "CASHIER";
  isActive?: boolean;
};

// No 0/O or 1/l/I: the password is often read out or copied by hand.
const PASSWORD_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

function generatePassword(length = 12): string {
  const bytes = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(bytes, (n) => PASSWORD_CHARS[n % PASSWORD_CHARS.length]).join("");
}

const inputClass =
  "h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15";

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
  const isEdit = Boolean(defaults.id);
  const [state, formAction] = useActionState(
    useSuccessToast(action, isEdit ? "User updated" : "User added"),
    {}
  );

  const [role, setRole] = useState(defaults.role);
  const [showPassword, setShowPassword] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  function fillGenerated() {
    if (!passwordRef.current) return;
    passwordRef.current.value = generatePassword();
    // Shown so it can be read out or written down before saving.
    setShowPassword(true);
  }

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
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              ref={passwordRef}
              id="user-password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              required={!isEdit}
              minLength={isEdit ? undefined : 8}
              defaultValue=""
              placeholder={
                isEdit ? "Leave blank to keep current password" : "min. 8 characters"
              }
              className={`${inputClass} pr-10`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-1 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-zinc-400 hover:text-zinc-700"
            >
              {showPassword ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
            </button>
          </div>
          <button
            type="button"
            onClick={fillGenerated}
            title="Make a strong random password"
            className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            <WandSparklesIcon className="h-4 w-4" />
            Generate
          </button>
        </div>
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
          value={role}
          onChange={(e) => setRole(e.target.value as UserDefaults["role"])}
          aria-describedby="user-role-summary"
          className={inputClass}
        >
          {[...ROLE_ORDER].reverse().map((value) => (
            <option key={value} value={value}>
              {ROLE_INFO[value].label}
            </option>
          ))}
        </select>
        <p id="user-role-summary" className="text-xs text-zinc-500">
          {ROLE_INFO[role].summary}
        </p>
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
            className="h-4 w-4 rounded border-zinc-300 accent-brand-700"
          />
          Active (inactive users cannot sign in)
        </label>
      )}

      <SubmitButton>{submitLabel}</SubmitButton>
    </form>
  );
}
