"use client";

import { useActionState } from "react";
import { useSuccessToast } from "@/app/components/toast";
import type { FormState } from "@/app/actions/products";
import { SubmitButton } from "@/app/components/submit-button";

export function CategoryForm({
  action,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState(
    useSuccessToast(action, "Category added"),
    {}
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {state?.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="name" className="text-sm font-medium text-zinc-700">
          Category name
        </label>
        <input
          id="name"
          name="name"
          required
          maxLength={50}
          placeholder="e.g. Power Tools"
          className="h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15"
        />
        {state?.fieldErrors?.name && (
          <p className="text-xs text-red-600">{state.fieldErrors.name[0]}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="description"
          className="text-sm font-medium text-zinc-700"
        >
          Description (optional)
        </label>
        <input
          id="description"
          name="description"
          maxLength={200}
          className="h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15"
        />
      </div>

      <SubmitButton>Create category</SubmitButton>
    </form>
  );
}
